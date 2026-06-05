import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ConversationRepository } from '../conversation/conversation.repository';
import {
  ConversationSession,
  ConversationTurn,
  Language,
  sessionKey,
  turnsKey,
} from './session.types';

/**
 * Lưu/khôi phục trạng thái phiên trên Redis và MongoDB. Mỗi phiên:
 *  - hash  `session:{id}`        → metadata (Redis)
 *  - list  `session:{id}:turns`  → lịch sử lượt (JSON) (Redis)
 * Lịch sử đầy đủ lưu trong MongoDB thông qua ConversationRepository.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ConversationRepository))
    private readonly conversationRepo: ConversationRepository,
  ) {}

  private get ttl(): number {
    return this.config.get<number>('session.ttlSeconds') as number;
  }

  private get maxContextTurns(): number {
    return this.config.get<number>('session.maxContextTurns') as number;
  }

  async createSession(
    id: string,
    language: Language | null = null,
  ): Promise<ConversationSession> {
    const now = new Date().toISOString();
    const session: ConversationSession = {
      id,
      language,
      createdAt: now,
      updatedAt: now,
    };
    await this.redis.hset(sessionKey(id), {
      language: language ?? '',
      createdAt: now,
      updatedAt: now,
    });
    await this.redis.expire(sessionKey(id), this.ttl);
    return session;
  }

  async exists(id: string): Promise<boolean> {
    return this.redis.exists(sessionKey(id));
  }

  /** Lấy phiên từ Redis hoặc fallback MongoDB. */
  async getSessionOrThrow(id: string): Promise<ConversationSession> {
    const data = await this.redis.hgetall(sessionKey(id));
    if (data && Object.keys(data).length > 0) {
      return {
        id,
        language: (data.language || null) as Language | null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }

    // Fallback to DB
    const conversation = await this.conversationRepo.findConversationById(id);
    if (!conversation || conversation.status === 'archived') {
      throw new NotFoundException(
        `Session ${id} không tồn tại hoặc đã bị lưu trữ`,
      );
    }

    // Load metadata to redis
    await this.createSession(id);

    // Load history to redis
    const messages = await this.conversationRepo.getMessagesByConversation(id);
    if (messages.length > 0) {
      const turns: string[] = messages.map((m) =>
        JSON.stringify({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        }),
      );
      await this.redis.rpush(turnsKey(id), ...turns);
      await this.redis.expire(turnsKey(id), this.ttl);
    }

    return {
      id,
      language: null,
      createdAt:
        (conversation as any).createdAt?.toISOString() ||
        new Date().toISOString(),
      updatedAt:
        (conversation as any).updatedAt?.toISOString() ||
        new Date().toISOString(),
    };
  }

  /** Gắn ngôn ngữ một lần ở lượt đầu (FR-007). */
  async setLanguageIfUnset(id: string, language: Language): Promise<void> {
    const data = await this.redis.hgetall(sessionKey(id));
    if (data && !data.language) {
      await this.redis.hset(sessionKey(id), { language });
    }
  }

  async appendTurn(id: string, turn: ConversationTurn): Promise<void> {
    await this.redis.rpush(turnsKey(id), JSON.stringify(turn));
    await this.touch(id);

    // Fire and forget: save to DB asynchronously
    this.conversationRepo
      .saveMessage(id, turn.role, turn.content)
      .catch((err) => {
        console.error(
          `Failed to save message to DB for conversation ${id}:`,
          err,
        );
      });
  }

  /** Lịch sử rút gọn (maxContextTurns lượt gần nhất) làm ngữ cảnh agent (FR-003). */
  async getContextTurns(id: string): Promise<ConversationTurn[]> {
    // We assume getSessionOrThrow is called before this, ensuring data is in Redis
    const start = -this.maxContextTurns;
    const raw = await this.redis.lrange(turnsKey(id), start, -1);
    return raw.map((r) => JSON.parse(r) as ConversationTurn);
  }

  async getAllTurns(id: string): Promise<ConversationTurn[]> {
    // We assume getSessionOrThrow is called before this, ensuring data is in Redis
    const raw = await this.redis.lrange(turnsKey(id), 0, -1);
    return raw.map((r) => JSON.parse(r) as ConversationTurn);
  }

  /** Refresh TTL của cả metadata và history (FR-014). */
  async touch(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.redis.hset(sessionKey(id), { updatedAt: now });
    await this.redis.expire(sessionKey(id), this.ttl);
    await this.redis.expire(turnsKey(id), this.ttl);
  }
}
