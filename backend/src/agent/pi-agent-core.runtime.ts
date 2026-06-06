import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BurgerPrintsService } from '../burgerprints/burgerprints.service';
import { MemoryService } from '../memory/memory.service';
import { AgentLogger } from '../logging/agent-logger.service';
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
    private readonly memory: MemoryService,
    private readonly agentLog: AgentLogger,
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<AgentChunk> {
    const startedAt = Date.now();
    let finalText = '';
    void this.agentLog.turnStart(input.sessionId, {
      message: input.message,
      history_turns: input.history.length,
      custom_prompt: !!(input.systemPrompt && input.systemPrompt.trim()),
    });
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
          tools: this.buildTools(input),
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
            finalText += e.delta;
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
          const { count, results } = this.extractToolResults(
            event.toolName,
            details,
          );
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
          void this.agentLog.turnEnd(input.sessionId, {
            reply: finalText,
            finishReason: errorMessage ? 'error' : 'stop',
            error: errorMessage ?? null,
            duration_ms: Date.now() - startedAt,
          });
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
      void this.agentLog.turnEnd(input.sessionId, {
        reply: finalText,
        finishReason: 'error',
        error: err.message,
        duration_ms: Date.now() - startedAt,
      });
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
    if (input.systemPrompt && input.systemPrompt.trim())
      return input.systemPrompt;
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
        meta:
          [money(p.base_cost), p.cheapest_factory]
            .filter(Boolean)
            .join(' · ') || undefined,
      }));
    } else if (
      toolName === 'compare_factories' &&
      Array.isArray(details.factories)
    ) {
      count = details.factories.length;
      items = details.factories.map((f: any) => ({
        title: f.partner_name,
        meta: money(f.min_price),
      }));
    } else if (
      toolName === 'get_product_variants' &&
      Array.isArray(details.variants)
    ) {
      count = details.total_matched ?? details.variants.length;
      items = details.variants.map((v: any) => ({
        title: v.catalog_sku ?? v.sku,
        meta:
          [`${v.color}/${v.size}`, money(v.price)]
            .filter(Boolean)
            .join(' · ') || undefined,
      }));
    } else if (toolName === 'create_order') {
      const oid = details.result?.order_id;
      if (oid)
        items = [
          { title: `Đơn ${oid}`, meta: details.sandbox ? 'sandbox' : 'thật' },
        ];
    } else if (toolName === 'get_shipping' && Array.isArray(details.shipping)) {
      count = details.total_countries ?? details.shipping.length;
      items = details.shipping.map((s: any) => ({
        title: s.country,
        meta:
          [money(s.first_item_price), s.time].filter(Boolean).join(' · ') ||
          undefined,
      }));
    }

    return { count, results: items?.slice(0, 8) };
  }

  /** Bộ tool tra cứu BurgerPrints API v2.0 (mỗi tool trả dữ liệu compact). */
  private buildTools(input: AgentRunInput): unknown[] {
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
        void this.agentLog.tool(input.sessionId, name, params ?? {}, data);
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          details: data,
        };
      },
    });

    return [
      tool(
        'search_products',
        'Find products by type/FEATURE + market + max base cost. category is full-text over ' +
          'name + description (material e.g. "cotton"/"ring-spun", print technique "DTG"/"DTF", features ' +
          '"long sleeve"/"fleece"...). Returns base_cost (lowest), cheapest factory, color count, sorted by price.',
        {
          category: {
            type: 'string',
            description:
              'Product type, e.g. "t-shirt", "hoodie", "tank top", "sweatshirt"',
          },
          market: {
            type: 'string',
            description: 'Market: US | EU | CN | AU (optional)',
          },
          max_base_cost: {
            type: 'number',
            description: 'Max base cost (USD) to filter, e.g. 8 (optional)',
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
        'Compare ALL factories (partner_name) of ONE product: min/max base cost per factory + sizes/colors. ' +
          'Use after a specific product is chosen (UC-02 step 2) or for margin.',
        {
          short_code: {
            type: 'string',
            description:
              'Product short_code, e.g. "USG5000" (from search_products)',
          },
        },
        ['short_code'],
        (p) => this.burgerprints.compareFactories(p.short_code),
      ),
      tool(
        'get_product_variants',
        'List concrete SKUs (sku, color, size, price, factory, in_stock) of a product, filtered by color/size/factory. Use for a specific color/size or before ordering.',
        {
          short_code: { type: 'string', description: 'Product short_code' },
          color: { type: 'string', description: 'Filter by color (optional)' },
          size: { type: 'string', description: 'Filter by size (optional)' },
          factory: {
            type: 'string',
            description: 'Filter by factory (optional)',
          },
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
        'Create a fulfillment order (bonus). Default sandbox=true (no real order). ' +
          'ONLY call after the seller confirms SKU + quantity + shipping address. Set sandbox=false only when the seller confirms a real order.',
        {
          shipping: {
            type: 'object',
            description: 'Shipping recipient info',
            properties: {
              name: { type: 'string' },
              address1: { type: 'string' },
              address2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string', description: 'Country code, e.g. US' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['name', 'address1', 'city', 'state', 'zip', 'country'],
          },
          items: {
            type: 'array',
            description: 'List of SKUs + quantities',
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
          sandbox: {
            type: 'boolean',
            description: 'true = test order (default true)',
          },
        },
        ['shipping', 'items'],
        (p) =>
          this.burgerprints.createOrder({
            shipping: p.shipping,
            items: p.items,
            sandbox: p.sandbox,
          }),
      ),
      tool(
        'search_history',
        'Search the FULL conversation history (BM25) when the seller refers to something said earlier that is NOT in the current context (only the last N turns are included). Returns the most relevant past turns.',
        {
          query: {
            type: 'string',
            description:
              'Keyword/content to find again in earlier conversation',
          },
        },
        ['query'],
        (p) => this.memory.searchHistory(input.sessionId, p.query),
      ),
      tool(
        'get_shipping',
        'Shipping fee + time of ONE factory to each country (carrier, first/additional item price). ' +
          'Get partner_id from compare_factories. Use to compare "which factory ships cheapest/fastest to country X" ' +
          'and to compute margin INCLUDING shipping.',
        {
          short_code: {
            type: 'string',
            description: 'Product short_code, e.g. "EUG2400"',
          },
          partner_id: {
            type: 'string',
            description:
              'Factory id (from compare_factories.factories[].partner_id)',
          },
          country: {
            type: 'string',
            description:
              'Filter by country (name or code, e.g. "US"/"Germany") — optional',
          },
        },
        ['short_code', 'partner_id'],
        (p) =>
          this.burgerprints.getShipping(p.short_code, p.partner_id, p.country),
      ),
      tool(
        'calculate_margin',
        'Compute margin PRECISELY for one or more products (deterministic). Do NOT do the math yourself. ' +
          'Margin% = (sell − base − shipping)/sell × 100. Pass shipping_cost ONLY when you have a real number ' +
          'from get_shipping; omit it → base-only margin (excludes shipping).',
        {
          items: {
            type: 'array',
            description: 'List of products to compute',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Product name/code' },
                sell_price: {
                  type: 'number',
                  description: 'Intended sell price (USD)',
                },
                base_cost: { type: 'number', description: 'Base cost (USD)' },
                shipping_cost: {
                  type: 'number',
                  description:
                    'Real shipping cost from get_shipping (optional)',
                },
              },
              required: ['sell_price', 'base_cost'],
            },
          },
        },
        ['items'],
        (p) => Promise.resolve(this.calcMargin(p.items)),
      ),
    ];
  }

  /** Tính margin deterministic (server-side) — tránh LLM làm toán sai. */
  private calcMargin(items: any[]): unknown {
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      note: 'shipping_cost empty → base-only margin (excludes shipping). Get real shipping via get_shipping and pass it in for full margin.',
      results: (Array.isArray(items) ? items : []).map((it) => {
        const sell = Number(it.sell_price);
        const base = Number(it.base_cost);
        const ship = Number(it.shipping_cost) || 0;
        const total = base + ship;
        const profit = sell - total;
        return {
          label: it.label ?? null,
          sell_price: sell,
          base_cost: base,
          shipping_cost: ship || null,
          total_cost: round(total),
          profit: round(profit),
          margin_percent:
            sell > 0 ? Math.round((profit / sell) * 1000) / 10 : null,
        };
      }),
    };
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
    `1. search_products(category, market?, max_base_cost?) → products by type/FEATURE in a market, with base_cost (lowest), cheapest factory, color count, sorted by price. category is full-text over name + description, so you can search by material ("cotton", "ring-spun"), print technique ("DTG"/"DTF") or feature ("long sleeve", "fleece"). Pass max_base_cost to filter by budget. Use FIRST to discover products or list the sub-types of a category. IMPORTANT: if the seller names a SPECIFIC product/model (e.g. "Bella + Canvas 3001", "Gildan 18600"), pass that exact name as category (matching is token/punctuation-insensitive) — do NOT search the generic type, because results are sorted by price and capped, so a specific (pricier) model would be hidden. If total_matched > products returned and you don't see the named product, refine the keyword before concluding it doesn't exist.`,
    `2. compare_factories(short_code) → base cost per factory (partner_name) + sizes/colors for ONE product. Use after a specific product is chosen, to compare factories or for margin.`,
    `3. get_product_variants(short_code, color?, size?, factory?) → concrete SKUs (sku, color, size, price, in_stock) for a product. Use for specific color/size or before ordering.`,
    `4. create_order(shipping, items, sandbox?) → place a fulfillment order. Default sandbox=true (test). ONLY after the seller confirms SKU + quantity + shipping address.`,
    `5. search_history(query) → search the FULL conversation history (BM25). Only the last few turns are in your context; if the seller refers to something said earlier that you don't see, call search_history to retrieve it instead of guessing or saying you forgot.`,
    `6. get_shipping(short_code, partner_id, country?) → shipping fee + time per country for ONE factory (partner_id from compare_factories). Use to answer "which factory ships cheapest/fastest to country X" and to compute margin INCLUDING shipping.`,
    ``,
    `SHORT_CODE RULE (critical): compare_factories / get_product_variants / get_shipping need a short_code. You MUST obtain short_code from a search_products result — NEVER invent or guess it (e.g. do not assume "EU3001" or "USBC3001"). If the seller names a product but you don't have its exact short_code, call search_products FIRST to resolve it, then use the returned short_code. A wrong short_code returns a 400 error.`,
    `DISAMBIGUATION: a category can have many sub-types (Hoodie = Pullover / Zip-up / Crop / Kids...). Do NOT assume one product. First search_products to list sub-types, show a short summary, ask which one — THEN compare_factories for the chosen product. If seller says "all", group by sub-type (one section each); never merge different products into one table.`,
    ``,
    `KEY DATA FACTS:`,
    `- "Factory" = partner_name. One product is fulfilled by MANY factories at different base costs.`,
    `- "price" = base cost of the 1st item; "2nd_price" = cost from the 2nd item onward.`,
    `- Market is inferred from short_code prefix (US.., EU.., AP..=CN).`,
    `- in_stock=false → SKU is out of stock; don't recommend/order it.`,
    `- Shipping fee/time by destination ARE available via get_shipping (per factory, per country); compare_factories returns processing_time per factory. Factory rating is NOT available — never invent it.`,
    `- TOTAL cost to a destination = base cost (compare_factories) + shipping first_item_price (get_shipping). Use this for accurate margin and "cheapest/fastest to country X".`,
    ``,
    `MARGIN: To compute margin you MUST call calculate_margin (do NOT do the arithmetic yourself — it has been wrong). Pass an items array with ONE entry PER product you are presenting, where base_cost is THAT product's real base_cost from the search_products result (e.g. 5.10, 7.25, 7.40) — NOT a budget cap/threshold/rounded number, and not a single placeholder. shipping_cost: include ONLY if you got a real number from get_shipping; otherwise omit it → base-only margin, state the caveat. Never assume/guess a shipping number. For "min margin X% at sell price P", max allowed base cost = P × (1 − X/100) — compute that and call search_products(max_base_cost=that), then still call calculate_margin with each product's real base_cost to show the actual margin.`,
    ``,
    `BEHAVIOR:`,
    `- Vague query ("I want to sell shirts") → ask 1-2 clarifying questions (market? product type? target price?).`,
    `- No match → relax the filter and suggest the closest options; never return empty-handed silently.`,
    `- Out-of-scope question → politely redirect to the BurgerPrints POD catalog.`,
    `- NEVER invent catalog data, prices, factories or SKUs. If a tool returns an error, tell the seller you couldn't fetch the data.`,
    `- After answering, suggest a helpful next step.`,
  ].join('\n');
}

/** Tóm tắt các tool (name + ý nghĩa) để FE hiển thị cho người viết prompt. */
export const AGENT_TOOLS_INFO: Array<{ name: string; desc: string }> = [
  {
    name: 'search_products',
    desc: 'Find products by type/feature + market + max base cost. category is full-text over name + description (material "cotton"/"ring-spun", print technique DTG/DTF, features "long sleeve"/"fleece"). Returns base_cost (lowest), cheapest factory, color count — sorted by price.',
  },
  {
    name: 'compare_factories',
    desc: 'Compare ALL factories of ONE product (short_code): min/max base cost per factory + sizes/colors. Use after a specific product is chosen, or for margin.',
  },
  {
    name: 'get_product_variants',
    desc: 'List concrete SKUs of a product (color/size/price/factory), with catalog_sku (order code) and in_stock. Use for a specific color/size or before ordering.',
  },
  {
    name: 'create_order',
    desc: 'Create a fulfillment order (shipping + items). Default sandbox=true (test order). Only call after the seller confirms SKU + quantity + address.',
  },
  {
    name: 'search_history',
    desc: 'Search past conversation history (BM25) when the seller refers to something said earlier that is no longer in the current context (only the last N turns are loaded).',
  },
  {
    name: 'get_shipping',
    desc: 'Shipping fee + time of one factory (partner_id from compare_factories) to each country (carrier, first/additional item price). Use for "cheapest/fastest to country X" and margin including shipping.',
  },
  {
    name: 'calculate_margin',
    desc: 'Compute margin precisely (deterministic) for one or more products: (sell − base − shipping)/sell × 100. The agent MUST use this tool instead of mental math.',
  },
];
