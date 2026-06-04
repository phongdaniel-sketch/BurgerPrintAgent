import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

/**
 * Client BurgerPrints API v2.0 (FR-006). Header auth: `api-key`.
 * Cache kết quả tra cứu vào Redis (TTL ngắn) để giảm gọi lặp trong một phiên (R7).
 * Lỗi/timeout API → trả lỗi có cấu trúc (agent không bịa) — Polish T035.
 */
@Injectable()
export class BurgerPrintsService {
  private readonly logger = new Logger(BurgerPrintsService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('burgerprints.baseUrl') as string;
  }
  private get apiKey(): string {
    return this.config.get<string>('burgerprints.apiKey') as string;
  }
  private get cacheTtl(): number {
    return this.config.get<number>('burgerprints.cacheTtlSeconds') as number;
  }

  /** Tra cứu sản phẩm/xưởng/SKU. Có cache theo tham số truy vấn. */
  async searchProducts(params: Record<string, unknown>): Promise<unknown> {
    return this.getCached('/products', params);
  }

  /** GET có cache. */
  async getCached(path: string, params: Record<string, unknown>): Promise<unknown> {
    const cacheKey = this.cacheKey(path, params);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`cache hit ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl}${path}`, {
          headers: { 'api-key': this.apiKey },
          params,
          timeout: 10_000,
        }),
      );
      await this.redis.setEx(cacheKey, JSON.stringify(res.data), this.cacheTtl);
      return res.data;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`BurgerPrints API lỗi GET ${path}: ${msg}`);
      // Trả lỗi có cấu trúc để runtime/agent biết là không lấy được dữ liệu.
      return {
        error: true,
        code: 'BURGERPRINTS_API_ERROR',
        message: `Không lấy được dữ liệu từ BurgerPrints API: ${msg}`,
      };
    }
  }

  private cacheKey(path: string, params: Record<string, unknown>): string {
    const hash = createHash('sha1')
      .update(path + JSON.stringify(params ?? {}))
      .digest('hex')
      .slice(0, 16);
    return `catalog:${hash}`;
  }
}
