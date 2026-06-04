import { AgentChunk, AgentRunInput } from './agent.types';

/** DI token cho AgentRuntime (cô lập pi-agent-core sau interface này). */
export const AGENT_RUNTIME = 'AGENT_RUNTIME';

/**
 * Port: backend chỉ phụ thuộc interface này, không phụ thuộc trực tiếp pi-agent-core.
 * Implementation phát AgentChunk dần qua AsyncIterable để controller đẩy ra SSE.
 */
export interface AgentRuntime {
  run(input: AgentRunInput): AsyncIterable<AgentChunk>;
}
