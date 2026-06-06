import { ConversationTurn, Language } from '../session/session.types';

/** Chunk phát ra từ AgentRuntime.run() → map sang SSE event (data-model: AgentChunk). */
export type AgentChunkType = 'token' | 'thinking' | 'tool' | 'error' | 'done';

export interface AgentTokenChunk {
  type: 'token';
  text: string;
}
/** Suy luận của model (reasoning) — hiển thị trong timeline "thinking", không lưu vào reply. */
export interface AgentThinkingChunk {
  type: 'thinking';
  text: string;
}
export interface AgentToolResultItem {
  title: string;
  meta?: string; // thông tin phụ hiển thị bên phải (giá, màu/size, domain...)
}
export interface AgentToolChunk {
  type: 'tool';
  id?: string; // toolCallId để FE khớp start/end (tool có thể chạy song song)
  name: string;
  status: 'running' | 'done';
  count?: number; // tổng số kết quả tool trả về
  results?: AgentToolResultItem[]; // vài kết quả đầu để show trong timeline
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
  | AgentThinkingChunk
  | AgentToolChunk
  | AgentErrorChunk
  | AgentDoneChunk;

/** Đầu vào một lượt cho runtime. */
export interface AgentRunInput {
  sessionId: string;
  message: string;
  language: Language | null;
  history: ConversationTurn[];
  /** System prompt custom do seller chỉnh (rỗng → dùng mặc định). */
  systemPrompt?: string;
}
