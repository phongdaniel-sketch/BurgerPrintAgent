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
        case 'tool_execution_end':
          push({
            type: 'tool',
            id: event.toolCallId,
            name: event.toolName,
            status: 'done',
          });
          break;
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

  /** System prompt định hướng agent (vai trò, ngôn ngữ, quy trình tool, công thức margin). */
  private buildSystemPrompt(input: AgentRunInput): string {
    const lang = input.language === 'en' ? 'English' : 'Vietnamese';
    return [
      `You are BurgerPrintsAgent — a POD (print-on-demand) fulfillment catalog assistant for BurgerPrints sellers.`,
      `Goal: help sellers SEARCH, COMPARE and CHOOSE products / factories / SKUs to fulfill, using ONLY real data from the tools.`,
      ``,
      `LANGUAGE: Always reply in ${lang} (mirror the seller's language). Be concise and decision-ready; use compact markdown tables when comparing.`,
      ``,
      `TOOLS & WORKFLOW:`,
      `1. search_products(keyword, market?) → list base products matching a product type (e.g. "t-shirt", "hoodie") and market (US/EU/CN). Use this first for broad queries.`,
      `2. get_product_pricing(short_code) → base cost per factory (partner_name) + sizes/colors for ONE product. Use to compare factories or get price for margin.`,
      `3. get_product_variants(short_code, color?, size?, factory?) → concrete SKUs (sku, color, size, price) for a product. Use when the seller wants specific color/size or to order.`,
      ``,
      `KEY DATA FACTS:`,
      `- "Factory" = partner_name. One product is fulfilled by MANY factories at different base costs.`,
      `- "price" = base cost of the 1st item; "2nd_price" = cost from the 2nd item onward.`,
      `- Market is inferred from short_code prefix (US.., EU.., AP..=CN) — pass market to search_products to narrow.`,
      `- ⚠️ Shipping fee by destination is NOT in the catalog API. Do not invent it; say it's only known at order time, and use factory location + base cost for guidance.`,
      ``,
      `MARGIN: Gross Margin % = (SellPrice − BaseCost − Shipping) / SellPrice × 100. If shipping unknown, compute margin on base cost only and state the caveat. For "min margin X% at sell price P", max allowed base cost = P × (1 − X/100).`,
      ``,
      `BEHAVIOR:`,
      `- Vague query ("I want to sell shirts") → ask 1-2 clarifying questions (market? product type? target price?).`,
      `- No match → relax the filter and suggest the closest options; never return empty-handed silently.`,
      `- Out-of-scope question → politely redirect to the BurgerPrints POD catalog.`,
      `- NEVER invent catalog data, prices, factories or SKUs. If a tool returns an error, tell the seller you couldn't fetch the data.`,
      `- After answering, suggest a helpful next step (e.g. "Want me to compare factories or show available colors?").`,
    ].join('\n');
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
        'Tìm danh sách base product theo loại sản phẩm và thị trường. Dùng đầu tiên cho câu hỏi chung. Trả short_code + tên + market + chất liệu/kỹ thuật in (KHÔNG có giá — lấy giá qua get_product_pricing).',
        {
          keyword: {
            type: 'string',
            description: 'Loại/từ khoá sản phẩm, vd "t-shirt", "hoodie", "tank top"',
          },
          market: {
            type: 'string',
            description: 'Thị trường: US | EU | CN | AU (tùy chọn)',
          },
        },
        [],
        (p) => this.burgerprints.searchProducts(p),
      ),
      tool(
        'get_product_pricing',
        'Lấy giá vốn (base cost) theo từng XƯỞNG (partner_name) + sizes/màu của MỘT sản phẩm. Dùng để so sánh xưởng hoặc tính margin.',
        {
          short_code: {
            type: 'string',
            description: 'Mã sản phẩm, vd "USG5000" (lấy từ search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerprints.getProductPricing(p.short_code),
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
    ];
  }
}
