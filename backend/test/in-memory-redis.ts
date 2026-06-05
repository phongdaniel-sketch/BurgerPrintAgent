import { RedisService } from '../src/redis/redis.service';

/**
 * In-memory fake của RedisService cho test (không cần Redis thật).
 * Hỗ trợ hash + list + string + TTL (TTL chỉ lưu, không tự expire trong test).
 */
export class InMemoryRedis implements Partial<RedisService> {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Record<string, string>>();
  private lists = new Map<string, string[]>();
  private ttls = new Map<string, number>();

  async ping(): Promise<boolean> {
    return true;
  }
  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }
  async setEx(key: string, value: string, ttl: number): Promise<void> {
    this.strings.set(key, value);
    this.ttls.set(key, ttl);
  }
  async expire(key: string, ttl: number): Promise<void> {
    this.ttls.set(key, ttl);
  }
  async exists(key: string): Promise<boolean> {
    return this.hashes.has(key) || this.strings.has(key) || this.lists.has(key);
  }
  async hset(key: string, data: Record<string, string>): Promise<void> {
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...data });
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    return this.hashes.get(key) ?? {};
  }
  async rpush(key: string, value: string): Promise<void> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
  }
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const len = list.length;
    const s = start < 0 ? Math.max(len + start, 0) : start;
    const e = stop < 0 ? len + stop : stop;
    return list.slice(s, e + 1);
  }
  async del(key: string): Promise<void> {
    this.strings.delete(key);
    this.hashes.delete(key);
    this.lists.delete(key);
    this.ttls.delete(key);
  }
  async quit(): Promise<void> {
    /* noop */
  }

  /** Tiện cho assertion TTL trong test. */
  getTtl(key: string): number | undefined {
    return this.ttls.get(key);
  }
}
