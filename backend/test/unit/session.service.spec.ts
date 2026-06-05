import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { SessionService } from '../../src/session/session.service';
import { RedisService } from '../../src/redis/redis.service';
import { InMemoryRedis } from '../in-memory-redis';

function makeService(): { service: SessionService; redis: InMemoryRedis } {
  const redis = new InMemoryRedis();
  const config = {
    get: (key: string) =>
      (
        ({
          'session.ttlSeconds': 3600,
          'session.maxContextTurns': 12,
        }) as Record<string, number>
      )[key],
  } as unknown as ConfigService;
  const service = new SessionService(redis as unknown as RedisService, config);
  return { service, redis };
}

describe('SessionService', () => {
  it('tạo phiên và lấy lại được metadata', async () => {
    const { service } = makeService();
    const session = await service.createSession('vi');
    expect(session.id).toBeDefined();
    const fetched = await service.getSessionOrThrow(session.id);
    expect(fetched.language).toBe('vi');
  });

  it('ném NotFound khi phiên không tồn tại', async () => {
    const { service } = makeService();
    await expect(service.getSessionOrThrow('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('append và đọc lại lượt hội thoại theo thứ tự', async () => {
    const { service } = makeService();
    const s = await service.createSession(null);
    await service.appendTurn(s.id, { role: 'user', content: 'hi', ts: 't1' });
    await service.appendTurn(s.id, {
      role: 'assistant',
      content: 'hello',
      ts: 't2',
    });
    const turns = await service.getAllTurns(s.id);
    expect(turns.map((t) => t.content)).toEqual(['hi', 'hello']);
  });

  it('refresh TTL khi append (FR-014)', async () => {
    const { service, redis } = makeService();
    const s = await service.createSession(null);
    await service.appendTurn(s.id, { role: 'user', content: 'x', ts: 't' });
    expect(redis.getTtl(`session:${s.id}`)).toBe(3600);
    expect(redis.getTtl(`session:${s.id}:turns`)).toBe(3600);
  });

  it('getContextTurns giới hạn maxContextTurns lượt gần nhất', async () => {
    const { service } = makeService();
    const s = await service.createSession(null);
    for (let i = 0; i < 20; i++) {
      await service.appendTurn(s.id, {
        role: 'user',
        content: `m${i}`,
        ts: `t${i}`,
      });
    }
    const ctx = await service.getContextTurns(s.id);
    expect(ctx).toHaveLength(12);
    expect(ctx[ctx.length - 1].content).toBe('m19');
  });
});
