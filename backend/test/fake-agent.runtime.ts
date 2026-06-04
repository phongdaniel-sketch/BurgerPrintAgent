import { AgentRuntime } from '../src/agent/agent-runtime.port';
import { AgentChunk, AgentRunInput } from '../src/agent/agent.types';

/**
 * Test-double cho AgentRuntime: phát token giả + done, không gọi LLM thật.
 * CHỈ dùng trong test (override provider AGENT_RUNTIME) — không thuộc source production.
 */
export class FakeAgentRuntime implements AgentRuntime {
  async *run(input: AgentRunInput): AsyncIterable<AgentChunk> {
    yield { type: 'tool', name: 'burgerprints_search', status: 'running' };
    yield { type: 'tool', name: 'burgerprints_search', status: 'done' };
    const reply = `echo: ${input.message}`;
    for (const word of reply.split(' ')) {
      yield { type: 'token', text: word + ' ' };
    }
    yield { type: 'done', finishReason: 'stop' };
  }
}
