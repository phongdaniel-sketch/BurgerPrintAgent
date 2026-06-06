import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

/**
 * Client cho catalog-api.burgerprints.com/api/v1/catalogsV2 — API catalog GIÀU hơn v2,
 * có dữ liệu mà api.burgerprints.com/v2 KHÔNG có: shipping theo xưởng theo nước,
 * processing time theo xưởng, decorations (kỹ thuật in). **Public, không cần auth.**
 *
 * partnerId ở đây KHỚP với partner_id của v2 (đã verify) → dùng chung.
 */
@Injectable()
export class CatalogV1Service {
  private readonly logger = new Logger(CatalogV1Service.name);
  private readonly baseUrl =
    process.env.CATALOG_V1_BASE_URL ??
    'https://catalog-api.burgerprints.com/api/v1/catalogsV2';

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Phí + thời gian ship của MỘT xưởng (partnerId) tới từng nước.
   * country (tùy chọn): lọc theo tên/mã nước. Sort theo giá tăng dần.
   */
  async getShipping(
    shortCode: string,
    partnerId: string,
    country?: string,
  ): Promise<unknown> {
    const data = await this.getCached(
      `/locations?shortCode=${encodeURIComponent(shortCode)}&partnerId=${encodeURIComponent(partnerId)}`,
    );
    if (!Array.isArray(data)) return data; // lỗi có cấu trúc

    let rows = data
      .filter((x: any) => Array.isArray(x.details) && x.details.length)
      .map((x: any) => {
        const d = x.details[0];
        return {
          country: x.countryName,
          country_code: x.countryCode,
          method: d.name,
          time: d.description,
          carrier: d.carriers,
          first_item_price: parseFloat(d.firstItemPrice),
          additional_item_price: parseFloat(d.additionalItemPrice),
        };
      });

    if (country) {
      const q = country.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.country?.toLowerCase().includes(q) ||
          r.country_code?.toLowerCase() === q,
      );
    }
    rows.sort((a, b) => a.first_item_price - b.first_item_price);

    return {
      short_code: shortCode,
      partner_id: partnerId,
      total_countries: rows.length,
      note: 'first_item_price = phí ship sản phẩm đầu; additional_item_price = phí mỗi sp thêm. time = thời gian giao.',
      shipping: rows.slice(0, country ? 25 : 50),
    };
  }

  /** Map partnerId → processing time (parse từ HTML của /decorations/filter). */
  async getProcessingByPartner(
    shortCode: string,
  ): Promise<Record<string, string | null>> {
    try {
      const data: any = await this.getCached(
        `/decorations/filter?shortCode=${encodeURIComponent(shortCode)}`,
      );
      const locs: any[] = data?.locations ?? [];
      const map: Record<string, string | null> = {};
      for (const l of locs) {
        const m = /Processing Time[\s\S]*?text-white[^>]*>([^<]+)</i.exec(
          l.value ?? '',
        );
        map[l.id] = m ? m[1].trim() : null;
      }
      return map;
    } catch {
      return {};
    }
  }

  /** GET có cache (catalog-api). */
  private async getCached(path: string): Promise<unknown> {
    const key = `catalogv1:${createHash('sha1').update(path).digest('hex').slice(0, 16)}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    try {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl}${path}`, { timeout: 15_000 }),
      );
      const data = (res.data as any)?.data ?? res.data;
      await this.redis.setEx(key, JSON.stringify(data), 1800);
      return data;
    } catch (err) {
      this.logger.error(
        `catalog-v1 lỗi GET ${path}: ${(err as Error).message}`,
      );
      return {
        error: true,
        code: 'CATALOG_V1_ERROR',
        message: `Không lấy được dữ liệu shipping/catalog v1: ${(err as Error).message}`,
      };
    }
  }
}
