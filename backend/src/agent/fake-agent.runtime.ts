import { Injectable, Logger } from '@nestjs/common';
import { AgentRuntime } from './agent-runtime.port';
import { AgentChunk, AgentRunInput } from './agent.types';

/**
 * Runtime giả lập: phát token dần để chạy/test luồng SSE khi chưa có key LLM thật.
 * Bật bằng USE_FAKE_AGENT=true. KHÔNG dùng cho production.
 */
@Injectable()
export class FakeAgentRuntime implements AgentRuntime {
  private readonly logger = new Logger(FakeAgentRuntime.name);

  async *run(input: AgentRunInput): AsyncIterable<AgentChunk> {
    this.logger.debug(`FakeAgentRuntime.run session=${input.sessionId}`);

    const isVietnamese = input.language !== 'en';
    const reply = isVietnamese
      ? `Bạn vừa hỏi: "${input.message}". Đây là phản hồi mẫu từ FakeAgentRuntime. ` +
        `Khi cắm pi-agent-core thật, agent sẽ tra cứu BurgerPrints API v2.0 để tư vấn xưởng/SKU.`
      : `You asked: "${input.message}". This is a sample reply from FakeAgentRuntime. ` +
        `With pi-agent-core wired in, the agent will query BurgerPrints API v2.0 for real fulfillment advice.`;

    // Giả lập một lần gọi công cụ
    yield { type: 'tool', name: 'burgerprints.searchProducts', status: 'running' };
    await this.delay(50);
    yield { type: 'tool', name: 'burgerprints.searchProducts', status: 'done' };

    for (const word of reply.split(' ')) {
      yield { type: 'token', text: word + ' ' };
      await this.delay(15);
    }

    yield { type: 'done', finishReason: 'stop' };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
