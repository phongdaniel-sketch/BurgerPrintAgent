import { Inject, Injectable, Logger } from '@nestjs/common';
import { AGENT_RUNTIME, AgentRuntime } from '../agent/agent-runtime.port';
import { AgentChunk } from '../agent/agent.types';
import { SessionService } from '../session/session.service';
import { ConversationSession, Language } from '../session/session.types';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly sessions: SessionService,
    @Inject(AGENT_RUNTIME) private readonly agent: AgentRuntime,
  ) {}

  async createConversation(language: Language | null): Promise<ConversationSession> {
    return this.sessions.createSession(language);
  }

  /**
   * Lõi US1: ghép session + agent runtime, stream AgentChunk.
   * - Lưu lượt user trước khi chạy agent.
   * - Gộp token để lưu lượt assistant khi `done`.
   * - Lỗi runtime → phát error chunk (đã do runtime đảm nhiệm) và không lưu assistant rỗng.
   * - Refresh TTL qua appendTurn (FR-003, FR-014).
   */
  async *streamMessage(sessionId: string, message: string): AsyncIterable<AgentChunk> {
    await this.sessions.getSessionOrThrow(sessionId); // 404 nếu không tồn tại/hết hạn

    const language = this.detectLanguage(message);
    await this.sessions.setLanguageIfUnset(sessionId, language);

    await this.sessions.appendTurn(sessionId, {
      role: 'user',
      content: message,
      ts: new Date().toISOString(),
    });

    const session = await this.sessions.getSessionOrThrow(sessionId);
    const history = await this.sessions.getContextTurns(sessionId);

    let assembled = '';
    let errored = false;

    try {
      for await (const chunk of this.agent.run({
        sessionId,
        message,
        language: session.language,
        history,
      })) {
        if (chunk.type === 'token') assembled += chunk.text;
        if (chunk.type === 'error') errored = true;
        yield chunk;
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (err) {
      // Lỗi không lường trước trong runtime → biến thành error chunk có cấu trúc (FR-011).
      this.logger.error(`Lỗi stream session=${sessionId}: ${(err as Error).message}`);
      errored = true;
      yield {
        type: 'error',
        code: 'AGENT_STREAM_ERROR',
        message: (err as Error).message,
      };
    }

    if (!errored && assembled.trim().length > 0) {
      await this.sessions.appendTurn(sessionId, {
        role: 'assistant',
        content: assembled.trim(),
        ts: new Date().toISOString(),
      });
    }
  }

  /** Fallback non-stream: gộp toàn bộ token thành một câu trả lời (R3). */
  async sendMessage(
    sessionId: string,
    message: string,
  ): Promise<{ sessionId: string; reply: string; finishReason: string }> {
    let reply = '';
    let finishReason = 'stop';
    for await (const chunk of this.streamMessage(sessionId, message)) {
      if (chunk.type === 'token') reply += chunk.text;
      if (chunk.type === 'done') finishReason = chunk.finishReason;
      if (chunk.type === 'error') {
        return { sessionId, reply: chunk.message, finishReason: 'error' };
      }
    }
    return { sessionId, reply: reply.trim(), finishReason };
  }

  /** Phát hiện ngôn ngữ thô (VN/EN) dựa trên dấu tiếng Việt (FR-007). */
  private detectLanguage(text: string): Language {
    const vietnamese =
      /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
    return vietnamese.test(text) ? 'vi' : 'en';
  }
}
