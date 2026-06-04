import { ConversationTurn, Language } from '../session/session.types';

/** Chunk phát ra từ AgentRuntime.run() → map sang SSE event (data-model: AgentChunk). */
export type AgentChunkType = 'token' | 'tool' | 'error' | 'done';

export interface AgentTokenChunk {
  type: 'token';
  text: string;
}
export interface AgentToolChunk {
  type: 'tool';
  name: string;
  status: 'running' | 'done';
}
export interface AgentErrorChunk {
  type: 'error';
  message: string;
  code: string;
}
export interface AgentDoneChunk {
  type: 'done';
  finishReason: string;
}

export type AgentChunk =
  | AgentTokenChunk
  | AgentToolChunk
  | AgentErrorChunk
  | AgentDoneChunk;

/** Đầu vào một lượt cho runtime. */
export interface AgentRunInput {
  sessionId: string;
  message: string;
  language: Language | null;
  history: ConversationTurn[];
}
