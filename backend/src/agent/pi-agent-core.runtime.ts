import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BurgerPrintsService } from '../burgerprints/burgerprints.service';
import { AgentRuntime } from './agent-runtime.port';
import { AgentChunk, AgentRunInput } from './agent.types';

/**
 * Adapter bọc `@earendil-works/pi-agent-core` (bộ "Pi" toolkit của earendil-works,
 * built trên `@earendil-works/pi-ai`). pi-agent-core là **push-based**: ta `subscribe`
 * các AgentEvent và gọi `await agent.prompt(...)`. Adapter này bắc cầu push → pull để
 * khớp port `AgentRuntime.run(): AsyncIterable<AgentChunk>` mà phần còn lại của hệ thống
 * (controller/SSE/session) đang dùng — nên controller không cần đổi.
 *
 * Map sự kiện:
 *   message_update + assistantMessageEvent.text_delta  → AgentChunk token
 *   tool_execution_start / tool_execution_end          → AgentChunk tool (running/done)
 *   agent_end (state.errorMessage)                     → AgentChunk error
 *   agent_end                                          → AgentChunk done
 *
 * Tham chiếu: https://www.npmjs.com/package/@earendil-works/pi-agent-core (README "Event Flow").
 */

// Dynamic import gián tiếp: pi packages là ESM-only. Dùng Function để giữ `import()` thật
// ở runtime, tránh tsc (module=commonjs) hạ cấp thành require() làm vỡ ESM.
const esmImport = new Function('m', 'return import(m)') as (
  m: string,
) => Promise<any>;

@Injectable()
export class PiAgentCoreRuntime implements AgentRuntime {
  private readonly logger = new Logger(PiAgentCoreRuntime.name);

  constructor(
    private readonly config: ConfigService,
    private readonly burgerprints: BurgerPrintsService,
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<AgentChunk> {
    let Agent: any;
    let getModel: any;
    try {
      ({ Agent } = await esmImport('@earendil-works/pi-agent-core'));
      ({ getModel } = await esmImport('@earendil-works/pi-ai'));
    } catch (err) {
      this.logger.error(
        `Không tải được pi-agent-core: ${(err as Error).message}`,
      );
      yield {
        type: 'error',
        code: 'AGENT_RUNTIME_UNAVAILABLE',
        message:
          'pi-agent-core chưa cài. Chạy `npm i @earendil-works/pi-agent-core @earendil-works/pi-ai`.',
      };
      return;
    }

    const provider = this.config.get<string>('llm.provider') as string;
    const modelId = this.config.get<string>('llm.model') as string;

    let agent: any;
    try {
      // pi-ai tự đọc API key từ env (ANTHROPIC_API_KEY / OPENAI_API_KEY).
      const openaiBaseUrl = this.config.get<string>('llm.openaiBaseUrl');
      let model: any;

      if (provider === 'openai' && openaiBaseUrl) {
        // Proxy OpenAI-compatible (vilao/OpenRouter/Azure/local): model id có thể
        // KHÔNG nằm trong registry pi-ai (vd "gx/gpt-5.4"). Dựng từ template hợp lệ
        // rồi override id + baseUrl, và ép dùng /chat/completions (proxy thường hỗ trợ
        // completions, không phải Responses API → tránh lỗi "messages null").
        model = getModel('openai', 'gpt-4o');
        if (modelId) model.id = modelId;
        model.baseUrl = openaiBaseUrl;
        model.api = 'openai-completions';
      } else {
        model = getModel(provider, modelId);
      }

      agent = new Agent({
        initialState: {
          systemPrompt: this.buildSystemPrompt(input),
          model,
          tools: this.buildTools(),
          // Lịch sử trước lượt hiện tại (lượt user hiện tại được gửi qua prompt()).
          messages: this.toAgentMessages(input),
        },
      });
    } catch (err) {
      this.logger.error(`Khởi tạo pi Agent lỗi: ${(err as Error).message}`);
      yield {
        type: 'error',
        code: 'AGENT_INIT_ERROR',
        message: (err as Error).message,
      };
      return;
    }

    // ── Bridge push (subscribe) → pull (async queue) ──────────────────────
    const queue: AgentChunk[] = [];
    let done = false;
    let wake: (() => void) | null = null;
    const push = (c: AgentChunk) => {
      queue.push(c);
      if (wake) {
        wake();
        wake = null;
      }
    };

    agent.subscribe((event: any) => {
      switch (event.type) {
        case 'message_update': {
          const e = event.assistantMessageEvent;
          if (e?.type === 'text_delta' && e.delta) {
            push({ type: 'token', text: e.delta });
          } else if (e?.type === 'thinking_delta' && e.delta) {
            push({ type: 'thinking', text: e.delta });
          }
          break;
        }
        case 'tool_execution_start':
          push({
            type: 'tool',
            id: event.toolCallId,
            name: event.toolName,
            status: 'running',
          });
          break;
        case 'tool_execution_end': {
          const details = event.result?.details ?? event.result;
          const { count, results } = this.extractToolResults(event.toolName, details);
          push({
            type: 'tool',
            id: event.toolCallId,
            name: event.toolName,
            status: 'done',
            count,
            results,
          });
          break;
        }
        case 'agent_end': {
          const errorMessage = agent.state?.errorMessage;
          if (errorMessage) {
            push({
              type: 'error',
              code: 'AGENT_RUNTIME_ERROR',
              message: errorMessage,
            });
          } else {
            push({ type: 'done', finishReason: 'stop' });
          }
          done = true;
          if (wake) {
            wake();
            wake = null;
          }
          break;
        }
      }
    });

    // Kích hoạt vòng lặp agent (không await ở đây để vừa chạy vừa tiêu thụ event).
    agent.prompt(input.message).catch((err: Error) => {
      push({ type: 'error', code: 'AGENT_PROMPT_ERROR', message: err.message });
      done = true;
      if (wake) {
        wake();
        wake = null;
      }
    });

    // Tiêu thụ queue, dừng khi đã done và rỗng.
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as AgentChunk;
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  }

  /** System prompt: dùng custom (nếu seller chỉnh) hoặc mặc định. */
  private buildSystemPrompt(input: AgentRunInput): string {
    if (input.systemPrompt && input.systemPrompt.trim()) return input.systemPrompt;
    return defaultSystemPrompt();
  }

  /**
   * Map lịch sử phiên (trừ lượt user hiện tại) sang AgentMessage[] của pi.
   * Lưu ý: pi `AssistantMessage.content` phải là MẢNG content-block (không phải string),
   * còn `UserMessage.content` chấp nhận string.
   */
  private toAgentMessages(input: AgentRunInput): unknown[] {
    const prior = input.history.slice(0, -1); // bỏ lượt user hiện tại (gửi qua prompt())
    return prior.map((t) => {
      const timestamp = Date.parse(t.ts) || undefined;
      if (t.role === 'assistant') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: t.content }],
          timestamp,
        };
      }
      return { role: 'user', content: t.content, timestamp };
    });
  }

  /** Trích vài kết quả đầu từ output tool để show trong timeline (như "8 results"). */
  private extractToolResults(
    toolName: string,
    details: any,
  ): { count?: number; results?: Array<{ title: string; meta?: string }> } {
    if (!details || typeof details !== 'object') return {};
    const money = (n: any) => (n != null && n !== '' ? `$${n}` : undefined);
    let items: Array<{ title: string; meta?: string }> | undefined;
    let count: number | undefined;

    if (toolName === 'search_products' && Array.isArray(details.products)) {
      count = details.qualified ?? details.products.length;
      items = details.products.map((p: any) => ({
        title: p.name ?? p.short_code,
        meta: [money(p.base_cost), p.cheapest_factory].filter(Boolean).join(' · ') || undefined,
      }));
    } else if (toolName === 'compare_factories' && Array.isArray(details.factories)) {
      count = details.factories.length;
      items = details.factories.map((f: any) => ({
        title: f.partner_name,
        meta: money(f.min_price),
      }));
    } else if (toolName === 'get_product_variants' && Array.isArray(details.variants)) {
      count = details.total_matched ?? details.variants.length;
      items = details.variants.map((v: any) => ({
        title: v.catalog_sku ?? v.sku,
        meta: [`${v.color}/${v.size}`, money(v.price)].filter(Boolean).join(' · ') || undefined,
      }));
    } else if (toolName === 'create_order') {
      const oid = details.result?.order_id;
      if (oid) items = [{ title: `Đơn ${oid}`, meta: details.sandbox ? 'sandbox' : 'thật' }];
    }

    return { count, results: items?.slice(0, 8) };
  }

  /** Bộ tool tra cứu BurgerPrints API v2.0 (mỗi tool trả dữ liệu compact). */
  private buildTools(): unknown[] {
    const tool = (
      name: string,
      description: string,
      properties: Record<string, unknown>,
      required: string[],
      run: (params: any) => Promise<unknown>,
    ) => ({
      name,
      description,
      parameters: { type: 'object', properties, required },
      execute: async (_id: string, params: any) => {
        const data = await run(params ?? {});
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          details: data,
        };
      },
    });

    return [
      tool(
        'search_products',
        'Tìm sản phẩm theo loại + thị trường + giá vốn tối đa. Trả về danh sách kèm base_cost ' +
          '(giá vốn thấp nhất), xưởng rẻ nhất, số màu — đã sort theo giá tăng dần. Dùng cho ' +
          'câu kiểu "T-shirt thị trường Mỹ giá vốn dưới $8".',
        {
          category: {
            type: 'string',
            description: 'Loại sản phẩm, vd "t-shirt", "hoodie", "tank top", "sweatshirt"',
          },
          market: {
            type: 'string',
            description: 'Thị trường: US | EU | CN | AU (tùy chọn)',
          },
          max_base_cost: {
            type: 'number',
            description: 'Giá vốn tối đa (USD) để lọc, vd 8 (tùy chọn)',
          },
        },
        [],
        (p) =>
          this.burgerprints.searchProducts({
            category: p.category,
            market: p.market,
            max_base_cost: p.max_base_cost,
          }),
      ),
      tool(
        'compare_factories',
        'So sánh TẤT CẢ xưởng (partner_name) của MỘT sản phẩm: base cost min/max mỗi xưởng + sizes/màu. ' +
          'Dùng sau khi đã chốt 1 loại sản phẩm cụ thể (UC-02 bước 2) hoặc để tính margin.',
        {
          short_code: {
            type: 'string',
            description: 'Mã sản phẩm, vd "USG5000" (lấy từ search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerprints.compareFactories(p.short_code),
      ),
      tool(
        'get_product_variants',
        'Liệt kê SKU cụ thể (sku, màu, size, giá, xưởng) của một sản phẩm, lọc theo màu/size/xưởng. Dùng khi seller muốn màu/size cụ thể hoặc chuẩn bị đặt hàng.',
        {
          short_code: { type: 'string', description: 'Mã sản phẩm' },
          color: { type: 'string', description: 'Lọc theo màu (tùy chọn)' },
          size: { type: 'string', description: 'Lọc theo size (tùy chọn)' },
          factory: { type: 'string', description: 'Lọc theo xưởng (tùy chọn)' },
        },
        ['short_code'],
        (p) =>
          this.burgerprints.getProductVariants(p.short_code, {
            color: p.color,
            size: p.size,
            factory: p.factory,
          }),
      ),
      tool(
        'create_order',
        'Tạo đơn fulfillment (UC-06, bonus). MẶC ĐỊNH sandbox=true (không phát sinh đơn thật). ' +
          'CHỈ gọi sau khi seller đã xác nhận SKU + số lượng + địa chỉ ship. Đặt sandbox=false chỉ khi seller xác nhận đặt thật.',
        {
          shipping: {
            type: 'object',
            description: 'Thông tin nhận hàng',
            properties: {
              name: { type: 'string' },
              address1: { type: 'string' },
              address2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string', description: 'Mã quốc gia, vd US' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['name', 'address1', 'city', 'state', 'zip', 'country'],
          },
          items: {
            type: 'array',
            description: 'Danh sách SKU + số lượng',
            items: {
              type: 'object',
              properties: {
                catalog_sku: { type: 'string' },
                quantity: { type: 'number' },
                design_url_front: { type: 'string' },
                mockup_url_front: { type: 'string' },
              },
              required: ['catalog_sku', 'quantity'],
            },
          },
          sandbox: { type: 'boolean', description: 'true = đơn thử (mặc định true)' },
        },
        ['shipping', 'items'],
        (p) =>
          this.burgerprints.createOrder({
            shipping: p.shipping,
            items: p.items,
            sandbox: p.sandbox,
          }),
      ),
    ];
  }
}

/** Default system prompt (export để controller trả về cho FE chỉnh sửa). */
export function defaultSystemPrompt(): string {
  return [
    `You are BurgerPrintsAgent — a POD (print-on-demand) fulfillment catalog assistant for BurgerPrints sellers.`,
    `Goal: help sellers SEARCH, COMPARE and CHOOSE products / factories / SKUs to fulfill, using ONLY real data from the tools.`,
    ``,
    `LANGUAGE: Always reply in the SAME language as the seller's latest message (auto-detect). Be concise and decision-ready; use compact markdown tables when comparing.`,
    ``,
    `TOOLS & WORKFLOW:`,
    `1. search_products(category, market?, max_base_cost?) → products of a type in a market, with base_cost (lowest), cheapest factory, color count, sorted by price. Pass max_base_cost to filter by budget. Use FIRST to discover products or list the sub-types of a category.`,
    `2. compare_factories(short_code) → base cost per factory (partner_name) + sizes/colors for ONE product. Use after a specific product is chosen, to compare factories or for margin.`,
    `3. get_product_variants(short_code, color?, size?, factory?) → concrete SKUs (sku, color, size, price, in_stock) for a product. Use for specific color/size or before ordering.`,
    `4. create_order(shipping, items, sandbox?) → place a fulfillment order. Default sandbox=true (test). ONLY after the seller confirms SKU + quantity + shipping address.`,
    ``,
    `DISAMBIGUATION: a category can have many sub-types (Hoodie = Pullover / Zip-up / Crop / Kids...). Do NOT assume one product. First search_products to list sub-types, show a short summary, ask which one — THEN compare_factories for the chosen product. If seller says "all", group by sub-type (one section each); never merge different products into one table.`,
    ``,
    `KEY DATA FACTS:`,
    `- "Factory" = partner_name. One product is fulfilled by MANY factories at different base costs.`,
    `- "price" = base cost of the 1st item; "2nd_price" = cost from the 2nd item onward.`,
    `- Market is inferred from short_code prefix (US.., EU.., AP..=CN).`,
    `- in_stock=false → SKU is out of stock; don't recommend/order it.`,
    `- Shipping fee/time by destination and factory rating are NOT in the catalog API. Never invent them; say they're not available and compare on base cost only.`,
    ``,
    `MARGIN: Gross Margin % = (SellPrice − BaseCost − Shipping) / SellPrice × 100. If shipping unknown, compute on base cost only and state the caveat. For "min margin X% at sell price P", max allowed base cost = P × (1 − X/100) — compute it then call search_products(max_base_cost=that).`,
    ``,
    `BEHAVIOR:`,
    `- Vague query ("I want to sell shirts") → ask 1-2 clarifying questions (market? product type? target price?).`,
    `- No match → relax the filter and suggest the closest options; never return empty-handed silently.`,
    `- Out-of-scope question → politely redirect to the BurgerPrints POD catalog.`,
    `- NEVER invent catalog data, prices, factories or SKUs. If a tool returns an error, tell the seller you couldn't fetch the data.`,
    `- After answering, suggest a helpful next step.`,
  ].join('\n');
}
