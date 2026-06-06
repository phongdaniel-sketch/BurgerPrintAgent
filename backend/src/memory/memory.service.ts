import { Injectable } from '@nestjs/common';
import MiniSearch from 'minisearch';
import { RedisService } from '../redis/redis.service';
import { turnsKey, ConversationTurn } from '../session/session.types';

/**
 * Memory tool: chỉ N turn gần nhất được đẩy vào LLM context. Khi seller hỏi điều
 * đã nói ở quá khứ (ngoài context), agent gọi search_history → tìm trên TOÀN BỘ
 * turns đã lưu (Redis) → trả các turn liên quan nhất.
 *
 * Dùng MiniSearch (ranking mặc định = BM25). Corpus nhỏ (turns của 1 phiên) nên
 * build index on-the-fly mỗi query.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly redis: RedisService) {}

  async searchHistory(
    sessionId: string,
    query: string,
    topK = 5,
  ): Promise<{
    query: string;
    total_searched: number;
    results: Array<{ turn: number; role: string; content: string; score: number }>;
  }> {
    const raw = await this.redis.lrange(turnsKey(sessionId), 0, -1);
    const turns: ConversationTurn[] = raw.map((r) => JSON.parse(r));

    const mini = new MiniSearch<{
      id: number;
      turn: number;
      role: string;
      content: string;
    }>({
      fields: ['content'],
      storeFields: ['turn', 'role', 'content'],
      // BM25 params (k1, b) — mặc định của MiniSearch; tách token theo chữ/số (Unicode → tiếng Việt)
      tokenize: (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [],
      searchOptions: { fuzzy: 0.2, prefix: true },
    });
    mini.addAll(
      turns.map((t, i) => ({ id: i, turn: i, role: t.role, content: t.content })),
    );

    const results = mini
      .search(query)
      .slice(0, topK)
      .map((h: any) => ({
        turn: h.turn,
        role: h.role,
        content: String(h.content).slice(0, 600),
        score: Math.round(h.score * 1000) / 1000,
      }));

    return { query, total_searched: turns.length, results };
  }
}
