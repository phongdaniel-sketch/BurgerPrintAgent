import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';

/**
 * Client BurgerPrints API v2.0 (FR-006). Header auth: `api-key`.
 *
 * Đặc điểm API (đã verify bằng curl thật):
 *  - GET /product: 505 base product, CỐ ĐỊNH 10/trang, KHÔNG hỗ trợ search/filter
 *    server-side → phải fetch hết rồi lọc client-side (cache `catalog:all` trong Redis).
 *  - GET /product/{short_code}: variations[] có thể RẤT lớn (vài nghìn SKU) → các method
 *    dưới đây luôn AGGREGATE/lọc trước khi trả cho agent (không bao giờ dump raw variations).
 *  - Không có endpoint tra cước ship theo điểm đến (chỉ có sau khi tạo đơn).
 *
 * Thị trường (market) suy ra từ tiền tố short_code (US/EU/AP/...) + "Manufactured in X"
 * trong html_desc.
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

  // ──────────────────────────────────────────────────────────────────────
  // Tool: tìm sản phẩm theo từ khoá / thị trường (UC-01, UC-02, UC-05)
  // ──────────────────────────────────────────────────────────────────────
  async searchProducts(params: {
    keyword?: string;
    market?: string;
    limit?: number;
  }): Promise<unknown> {
    const all = await this.getAllBaseProducts();
    if (!Array.isArray(all)) return all; // lỗi API có cấu trúc

    const kw = (params.keyword ?? '').toLowerCase().trim();
    const market = this.normalizeMarket(params.market);
    const limit = Math.min(params.limit ?? 15, 30);

    const matched = all
      .map((p) => {
        const meta = this.parseHtmlDesc(p.html_desc ?? '');
        return {
          short_code: p.short_code,
          name: p.name,
          market: this.marketOf(p.short_code, meta.location),
          printing: meta.printing,
          material: meta.material,
          location: meta.location,
        };
      })
      .filter((p) => {
        const kwOk =
          !kw ||
          p.name?.toLowerCase().includes(kw) ||
          p.short_code?.toLowerCase().includes(kw);
        const marketOk = !market || p.market === market;
        return kwOk && marketOk;
      });

    return {
      total_matched: matched.length,
      note:
        'Giá nằm trong product detail (gọi get_product_pricing với short_code). ' +
        'Phí ship theo điểm đến không có trong catalog.',
      products: matched.slice(0, limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: giá + so sánh xưởng cho 1 sản phẩm (UC-02, UC-03)
  // ──────────────────────────────────────────────────────────────────────
  async getProductPricing(shortCode: string): Promise<unknown> {
    const detail = await this.getProductDetail(shortCode);
    if (!detail || (detail as any).error) return detail;
    const d = (detail as any).data ?? detail;
    const variations: any[] = d.variations ?? [];

    // Gom theo xưởng (partner_name) → min/max base cost + số SKU.
    const byFactory = new Map<
      string,
      { min: number; max: number; count: number }
    >();
    for (const v of variations) {
      const f = v.partner_name || 'Unknown';
      const price = parseFloat(v.price);
      if (Number.isNaN(price)) continue;
      const cur = byFactory.get(f) ?? { min: price, max: price, count: 0 };
      cur.min = Math.min(cur.min, price);
      cur.max = Math.max(cur.max, price);
      cur.count += 1;
      byFactory.set(f, cur);
    }

    const factories = [...byFactory.entries()]
      .map(([partner_name, s]) => ({
        partner_name,
        min_price: s.min,
        max_price: s.max,
        sku_count: s.count,
      }))
      .sort((a, b) => a.min_price - b.min_price);

    const meta = this.parseHtmlDesc(d.html_desc ?? '');
    return {
      short_code: d.short_code,
      name: d.name,
      market: this.marketOf(d.short_code, meta.location),
      printing: meta.printing,
      location: meta.location,
      sizes: (d.available_sizes ?? []).map((s: any) => s.name),
      colors_count: (d.available_colors ?? []).length,
      colors_sample: (d.available_colors ?? [])
        .slice(0, 12)
        .map((c: any) => c.name),
      cheapest_factory: factories[0] ?? null,
      factories,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: liệt kê SKU (variants) theo màu/size/xưởng (UC-04)
  // ──────────────────────────────────────────────────────────────────────
  async getProductVariants(
    shortCode: string,
    filter: { color?: string; size?: string; factory?: string; limit?: number },
  ): Promise<unknown> {
    const detail = await this.getProductDetail(shortCode);
    if (!detail || (detail as any).error) return detail;
    const d = (detail as any).data ?? detail;
    const variations: any[] = d.variations ?? [];
    const limit = Math.min(filter.limit ?? 30, 60);

    const color = filter.color?.toLowerCase();
    const size = filter.size?.toLowerCase();
    const factory = filter.factory?.toLowerCase();

    const matched = variations
      .filter(
        (v) =>
          (!color || (v.color ?? '').toLowerCase().includes(color)) &&
          (!size || (v.size ?? '').toLowerCase() === size) &&
          (!factory || (v.partner_name ?? '').toLowerCase().includes(factory)),
      )
      .map((v) => ({
        sku: v.sku,
        color: v.color,
        size: v.size,
        price: v.price,
        second_price: v['2nd_price'],
        partner_name: v.partner_name,
      }));

    return {
      short_code: d.short_code,
      name: d.name,
      total_matched: matched.length,
      variants: matched.slice(0, limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Hạ tầng: fetch + cache
  // ──────────────────────────────────────────────────────────────────────

  /** Fetch toàn bộ base products (paging) + cache compact list trong Redis. */
  private async getAllBaseProducts(): Promise<
    Array<{ short_code: string; name: string; html_desc: string; desc: string }>
  > {
    const cacheKey = 'catalog:all';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      const out: any[] = [];
      let page = 1;
      let total = Infinity;
      // API hỗ trợ `page_size` (snake_case) → lấy cả catalog trong 1 request.
      // Vẫn lặp dự phòng nếu API cap page_size (collected < total).
      const PAGE_SIZE = 1000;
      while (out.length < total && page <= 80) {
        const res = await firstValueFrom(
          this.http.get(`${this.baseUrl}/product`, {
            headers: { 'api-key': this.apiKey },
            params: { page, page_size: PAGE_SIZE },
            timeout: 20_000,
          }),
        );
        const data = res.data?.data ?? {};
        total = data.total ?? out.length;
        const result: any[] = data.result ?? [];
        if (result.length === 0) break;
        for (const p of result) {
          out.push({
            short_code: p.short_code,
            name: p.name,
            html_desc: p.html_desc,
            desc: p.desc,
          });
        }
        page += 1;
      }
      await this.redis.setEx(cacheKey, JSON.stringify(out), this.cacheTtl);
      this.logger.log(
        `Catalog cached: ${out.length} base products (${page - 1} request)`,
      );
      return out;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`BurgerPrints API lỗi GET /product (list): ${msg}`);
      return {
        error: true,
        code: 'BURGERPRINTS_API_ERROR',
        message: `Không lấy được catalog từ BurgerPrints API: ${msg}`,
      } as any;
    }
  }

  /** GET /product/{short_code} (chi tiết + variations) có cache. */
  async getProductDetail(shortCode: string): Promise<unknown> {
    return this.getCached(`/product/${encodeURIComponent(shortCode)}`);
  }

  /** GET 1 path có cache. */
  async getCached(path: string): Promise<unknown> {
    const cacheKey = this.cacheKey(path);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    try {
      const res = await firstValueFrom(
        this.http.get(`${this.baseUrl}${path}`, {
          headers: { 'api-key': this.apiKey },
          timeout: 15_000,
        }),
      );
      await this.redis.setEx(cacheKey, JSON.stringify(res.data), this.cacheTtl);
      return res.data;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`BurgerPrints API lỗi GET ${path}: ${msg}`);
      return {
        error: true,
        code: 'BURGERPRINTS_API_ERROR',
        message: `Không lấy được dữ liệu từ BurgerPrints API: ${msg}`,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  /** Rút Material / Printing technique / Location từ html_desc (HTML). */
  private parseHtmlDesc(html: string): {
    material: string | null;
    printing: string | null;
    location: string | null;
  } {
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const printing =
      /(?:Printing tech\w*|Technique)[:\s]*([^.<]+?)(?:\.|Manufactured|Location|$)/i.exec(
        text,
      )?.[1] ??
      (/(DTG|DTF|Dye-sublimation|Sublimation)/i.exec(text)?.[0] || null);
    const location =
      /Manufactured in ([A-Za-z ]+?)(?:\.|,|<|$)/i.exec(text)?.[1]?.trim() ??
      /Location[:\s]*([A-Za-z ]+?)(?:\.|,|<|$)/i.exec(text)?.[1]?.trim() ??
      null;
    const material =
      /(\d+%[^.]*?(?:cotton|polyester|spandex)[^.]*)/i.exec(text)?.[1]?.trim() ??
      null;
    return {
      material: material ? material.slice(0, 80) : null,
      printing: printing ? printing.trim().slice(0, 40) : null,
      location,
    };
  }

  /** Suy ra market từ tiền tố short_code + location. */
  private marketOf(shortCode: string, location: string | null): string {
    const sc = (shortCode ?? '').toUpperCase();
    if (sc.startsWith('US')) return 'US';
    if (sc.startsWith('EU')) return 'EU';
    if (sc.startsWith('AU')) return 'AU';
    if (sc.startsWith('AP') || sc.startsWith('CN')) return 'CN';
    const loc = (location ?? '').toLowerCase();
    if (loc.includes('united states')) return 'US';
    if (loc.includes('euro')) return 'EU';
    if (loc.includes('china')) return 'CN';
    return 'OTHER';
  }

  /** Chuẩn hoá tham số market người dùng nhập → mã chuẩn. */
  private normalizeMarket(market?: string): string | null {
    if (!market) return null;
    const m = market.toLowerCase();
    if (/\b(us|usa|mỹ|my|hoa kỳ|united states|america)\b/.test(m)) return 'US';
    if (/\b(eu|europe|châu âu|chau au|european)\b/.test(m)) return 'EU';
    if (/\b(cn|china|trung quốc|trung quoc)\b/.test(m)) return 'CN';
    if (/\b(au|australia|úc|uc)\b/.test(m)) return 'AU';
    return market.toUpperCase();
  }

  private cacheKey(path: string): string {
    const hash = createHash('sha1').update(path).digest('hex').slice(0, 16);
    return `catalog:${hash}`;
  }
}
