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
const esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

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
      this.logger.error(`Không tải được pi-agent-core: ${(err as Error).message}`);
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
      const model = getModel(provider, modelId);
      agent = new Agent({
        initialState: {
          systemPrompt: this.buildSystemPrompt(input),
          model,
          tools: [this.buildSearchTool()],
          // Lịch sử trước lượt hiện tại (lượt user hiện tại được gửi qua prompt()).
          messages: this.toAgentMessages(input),
        },
      });
    } catch (err) {
      this.logger.error(`Khởi tạo pi Agent lỗi: ${(err as Error).message}`);
      yield { type: 'error', code: 'AGENT_INIT_ERROR', message: (err as Error).message };
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
          }
          break;
        }
        case 'tool_execution_start':
          push({ type: 'tool', name: event.toolName, status: 'running' });
          break;
        case 'tool_execution_end':
          push({ type: 'tool', name: event.toolName, status: 'done' });
          break;
        case 'agent_end': {
          const errorMessage = agent.state?.errorMessage;
          if (errorMessage) {
            push({ type: 'error', code: 'AGENT_RUNTIME_ERROR', message: errorMessage });
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

  /** System prompt định hướng agent (ngôn ngữ + vai trò tư vấn fulfillment). */
  private buildSystemPrompt(input: AgentRunInput): string {
    const lang = input.language === 'en' ? 'English' : 'Vietnamese';
    return (
      `You are BurgerPrintsAgent, a POD fulfillment catalog assistant for sellers. ` +
      `Help them find, compare, and choose products/factories/SKUs using the BurgerPrints catalog tool. ` +
      `Always answer in ${lang}. Be concise and decision-ready; cite price and factory (partner_name) when comparing. ` +
      `Use the burgerprints_search tool to fetch real data — never invent catalog data.`
    );
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

  /**
   * Tool tra cứu BurgerPrints API v2.0. pi dùng typebox schema cho tham số.
   * Dùng plain JSON schema object (tương thích typebox runtime ở mức cơ bản).
   */
  private buildSearchTool(): unknown {
    return {
      name: 'burgerprints_search',
      label: 'BurgerPrints catalog search',
      description:
        'Tìm sản phẩm/xưởng/SKU fulfillment trên BurgerPrints theo tiêu chí ' +
        '(loại sản phẩm, thị trường, giá vốn, thời gian ship). Trả dữ liệu thật từ API v2.0.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Từ khóa/loại sản phẩm cần tìm' },
        },
        required: ['query'],
      },
      execute: async (_toolCallId: string, params: { query?: string }) => {
        const data = await this.burgerprints.searchProducts({ q: params?.query });
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          details: data,
        };
      },
    };
  }
}
