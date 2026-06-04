export type Language = 'vi' | 'en';
export type TurnRole = 'user' | 'assistant';

/** Một lượt hội thoại (data-model: ConversationTurn). */
export interface ConversationTurn {
  role: TurnRole;
  content: string;
  ts: string; // ISO datetime
}

/** Metadata phiên (data-model: ConversationSession). */
export interface ConversationSession {
  id: string;
  language: Language | null;
  createdAt: string;
  updatedAt: string;
}

/** Key helpers — mọi key namespace dưới `session:`. */
export const sessionKey = (id: string): string => `session:${id}`;
export const turnsKey = (id: string): string => `session:${id}:turns`;
