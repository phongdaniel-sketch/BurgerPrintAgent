import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../redis/redis.service';
import {
  ConversationSession,
  ConversationTurn,
  Language,
  sessionKey,
  turnsKey,
} from './session.types';

/**
 * Lưu/khôi phục trạng thái phiên trên Redis. Mỗi phiên:
 *  - hash  `session:{id}`        → metadata
 *  - list  `session:{id}:turns`  → lịch sử lượt (JSON)
 * TTL refresh mỗi hoạt động (FR-014). Cô lập theo namespace key (FR-005).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get ttl(): number {
    return this.config.get<number>('session.ttlSeconds') as number;
  }

  private get maxContextTurns(): number {
    return this.config.get<number>('session.maxContextTurns') as number;
  }

  async createSession(language: Language | null = null): Promise<ConversationSession> {
    const id = uuidv4();
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

  /** Lấy phiên hoặc ném 404 nếu không tồn tại / đã hết hạn. */
  async getSessionOrThrow(id: string): Promise<ConversationSession> {
    const data = await this.redis.hgetall(sessionKey(id));
    if (!data || Object.keys(data).length === 0) {
      throw new NotFoundException(`Session ${id} không tồn tại hoặc đã hết hạn`);
    }
    return {
      id,
      language: (data.language || null) as Language | null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
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
  }

  /** Lịch sử rút gọn (maxContextTurns lượt gần nhất) làm ngữ cảnh agent (FR-003). */
  async getContextTurns(id: string): Promise<ConversationTurn[]> {
    const start = -this.maxContextTurns;
    const raw = await this.redis.lrange(turnsKey(id), start, -1);
    return raw.map((r) => JSON.parse(r) as ConversationTurn);
  }

  async getAllTurns(id: string): Promise<ConversationTurn[]> {
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
