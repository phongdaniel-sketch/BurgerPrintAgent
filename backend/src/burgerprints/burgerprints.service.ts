import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '../redis/redis.service';
import { CatalogV1Service } from '../catalog-v1/catalog-v1.service';

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
    private readonly catalogV1: CatalogV1Service,
  ) {}

  /** Tool get_shipping: phí + thời gian ship của 1 xưởng tới từng nước (catalog-api v1). */
  async getShipping(
    shortCode: string,
    partnerId: string,
    country?: string,
  ): Promise<unknown> {
    return this.catalogV1.getShipping(shortCode, partnerId, country);
  }

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
  // Tool: tìm sản phẩm theo category + market + max_base_cost (UC-01, UC-02, UC-05)
  // ──────────────────────────────────────────────────────────────────────
  async searchProducts(params: {
    category?: string;
    keyword?: string;
    market?: string;
    max_base_cost?: number;
    limit?: number;
  }): Promise<unknown> {
    const all = await this.getAllBaseProducts();
    if (!Array.isArray(all)) return all; // lỗi API có cấu trúc

    const kw = (params.category ?? params.keyword ?? '').toLowerCase().trim();
    const market = this.normalizeMarket(params.market);
    const maxCost =
      typeof params.max_base_cost === 'number' && params.max_base_cost > 0
        ? params.max_base_cost
        : null;
    const limit = Math.min(params.limit ?? 15, 25);

    // B1: lọc theo category (tên) + market từ catalog đã cache (rẻ)
    const matched = all
      .map((p) => ({
        short_code: p.short_code,
        name: p.name,
        market: this.marketOf(
          p.short_code,
          this.parseHtmlDesc(p.html_desc ?? '').location,
        ),
        html_desc: p.html_desc,
      }))
      .filter((p) => {
        const kwOk = this.matchKeyword(p.name ?? '', kw);
        const marketOk = !market || p.market === market;
        return kwOk && marketOk;
      });

    // B2: enrich GIÁ (base cost) bằng product detail — fetch song song, có cache.
    // Cap số sản phẩm enrich để giữ độ trễ hợp lý.
    const ENRICH_CAP = 80;
    const toEnrich = matched.slice(0, ENRICH_CAP);
    const enriched = await this.mapLimit(toEnrich, 10, async (p) => {
      const detail = await this.getProductDetail(p.short_code);
      const d = (detail as any)?.data;
      if (!d || (detail as any)?.error) {
        return { ...p, base_cost: null, cheapest_factory: null, colors: null };
      }
      const v: any[] = d.variations ?? [];
      let min = Infinity;
      let factory: string | null = null;
      for (const x of v) {
        const pr = parseFloat(x.price);
        if (!Number.isNaN(pr) && pr < min) {
          min = pr;
          factory = x.partner_name;
        }
      }
      const meta = this.parseHtmlDesc(d.html_desc ?? '');
      return {
        short_code: p.short_code,
        name: p.name,
        market: p.market,
        base_cost: Number.isFinite(min) ? min : null,
        cheapest_factory: factory,
        colors: (d.available_colors ?? []).length,
        printing: meta.printing,
        processing_time: meta.processingTime,
      };
    });

    // B3: filter theo max_base_cost + sort theo giá tăng dần
    let result = enriched.filter((r) => r.base_cost != null);
    if (maxCost != null)
      result = result.filter((r) => (r.base_cost as number) <= maxCost);
    result.sort((a, b) => (a.base_cost as number) - (b.base_cost as number));

    return {
      query: {
        category: kw || null,
        market: market || null,
        max_base_cost: maxCost,
      },
      total_matched: matched.length,
      enriched: toEnrich.length,
      qualified: result.length,
      truncated: matched.length > ENRICH_CAP,
      note: 'base_cost = giá vốn thấp nhất của sản phẩm (theo xưởng rẻ nhất). Phí/thời gian ship theo điểm đến KHÔNG có trong catalog; processing_time là thời gian sản xuất nếu API có ghi.',
      products: result.slice(0, limit),
    };
  }

  /** Chạy fn cho từng item với giới hạn concurrency. */
  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (i < items.length) {
          const idx = i++;
          out[idx] = await fn(items[idx]);
        }
      },
    );
    await Promise.all(workers);
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: so sánh xưởng cho 1 sản phẩm (UC-02 bước 2, UC-03)
  // ──────────────────────────────────────────────────────────────────────
  async compareFactories(shortCode: string): Promise<unknown> {
    const detail = await this.getProductDetail(shortCode);
    if (!detail || (detail as any).error) return detail;
    const d = (detail as any).data ?? detail;
    const variations: any[] = d.variations ?? [];

    // Gom theo xưởng (partner_name) → min/max base cost + số SKU + partner_id.
    const byFactory = new Map<
      string,
      { min: number; max: number; count: number; partner_id: string | null }
    >();
    for (const v of variations) {
      const f = v.partner_name || 'Unknown';
      const price = parseFloat(v.price);
      if (Number.isNaN(price)) continue;
      const cur = byFactory.get(f) ?? {
        min: price,
        max: price,
        count: 0,
        partner_id: v.partner_id ?? null,
      };
      cur.min = Math.min(cur.min, price);
      cur.max = Math.max(cur.max, price);
      cur.count += 1;
      byFactory.set(f, cur);
    }

    // Processing time mỗi xưởng (catalog-api v1) — best-effort, cache.
    const processing = await this.catalogV1.getProcessingByPartner(
      d.short_code,
    );

    const factories = [...byFactory.entries()]
      .map(([partner_name, s]) => ({
        partner_name,
        partner_id: s.partner_id, // dùng cho get_shipping
        min_price: s.min,
        max_price: s.max,
        sku_count: s.count,
        processing_time: (s.partner_id && processing[s.partner_id]) || null,
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

    const oos = await this.getOutOfStockSet(); // SKU hết hàng (lọc/đánh dấu)

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
        // catalog_sku = format dùng khi TẠO ĐƠN (short_code-Color-Size), khác sku nội bộ.
        catalog_sku: `${d.short_code}-${v.color}-${v.size}`,
        color: v.color,
        size: v.size,
        price: v.price,
        second_price: v['2nd_price'],
        partner_name: v.partner_name,
        in_stock: !oos.has(v.sku),
      }));

    return {
      short_code: d.short_code,
      name: d.name,
      total_matched: matched.length,
      out_of_stock_count: matched.filter((m) => !m.in_stock).length,
      note: 'Dùng catalog_sku (KHÔNG phải sku) khi create_order. in_stock=false là SKU hết hàng — không gợi ý/đặt.',
      variants: matched.slice(0, limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool: tạo đơn hàng (UC-06 bonus) — mặc định sandbox để demo an toàn
  // ──────────────────────────────────────────────────────────────────────
  async createOrder(payload: {
    shipping: {
      name: string;
      address1: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
      country: string;
      email?: string;
      phone?: string;
    };
    items: Array<{
      catalog_sku: string;
      quantity: number;
      design_url_front?: string;
      mockup_url_front?: string;
    }>;
    reference_order_id?: string;
    sandbox?: boolean;
  }): Promise<unknown> {
    const s = payload.shipping;
    const body: Record<string, unknown> = {
      shipping_name: s.name,
      shipping_address1: s.address1,
      shipping_address2: s.address2 ?? '',
      shipping_city: s.city,
      shipping_state: s.state,
      shipping_zip: s.zip,
      shipping_country: s.country,
      shipping_email: s.email ?? '',
      shipping_phone: s.phone ?? '',
      reference_order_id: payload.reference_order_id ?? `agent-${Date.now()}`,
      items: payload.items.map((it) => ({
        catalog_sku: it.catalog_sku,
        quantity: it.quantity,
        ...(it.design_url_front
          ? { design_url_front: it.design_url_front }
          : {}),
        ...(it.mockup_url_front
          ? { mockup_url_front: it.mockup_url_front }
          : {}),
      })),
      // Mặc định sandbox=true (không phát sinh đơn thật) trừ khi seller xác nhận thật.
      sandbox: payload.sandbox ?? true,
    };

    try {
      const res = await firstValueFrom(
        this.http.post(`${this.baseUrl}/order`, body, {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
        }),
      );
      return { sandbox: body.sandbox, result: res.data };
    } catch (err) {
      const msg = (err as any)?.response?.data ?? (err as Error).message;
      this.logger.error(`Tạo đơn lỗi: ${JSON.stringify(msg)}`);
      return {
        error: true,
        code: 'CREATE_ORDER_ERROR',
        message: 'Không tạo được đơn',
        detail: msg,
      };
    }
  }

  /** Tập SKU hết hàng từ /product/outofstock (paging + cache). */
  private async getOutOfStockSet(): Promise<Set<string>> {
    const cacheKey = 'catalog:oos';
    const cached = await this.redis.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached));
    const skus: string[] = [];
    try {
      let page = 1;
      let total = Infinity;
      while (skus.length < total && page <= 60) {
        const res = await firstValueFrom(
          this.http.get(`${this.baseUrl}/product/outofstock`, {
            headers: { 'api-key': this.apiKey },
            params: { page, page_size: 1000 },
            timeout: 20_000,
          }),
        );
        const data = res.data?.data ?? {};
        total = data.total ?? skus.length;
        const result: any[] = data.result ?? data.data ?? [];
        if (result.length === 0) break;
        for (const item of result) {
          for (const sku of item.sku ?? []) skus.push(sku);
        }
        page += 1;
      }
      await this.redis.setEx(cacheKey, JSON.stringify(skus), this.cacheTtl);
    } catch (err) {
      this.logger.error(`outofstock lỗi: ${(err as Error).message}`);
    }
    return new Set(skus);
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

  /** Rút Material / Printing technique / Location / Processing time từ html_desc (HTML). */
  private parseHtmlDesc(html: string): {
    material: string | null;
    printing: string | null;
    location: string | null;
    processingTime: string | null;
  } {
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const processingTime =
      /Processing Time[:\s]*([^<.]+?)(?:\.|<|Shipping|$)/i
        .exec(text)?.[1]
        ?.trim()
        ?.slice(0, 50) ?? null;
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
      /(\d+%[^.]*?(?:cotton|polyester|spandex)[^.]*)/i
        .exec(text)?.[1]
        ?.trim() ?? null;
    return {
      material: material ? material.slice(0, 80) : null,
      printing: printing ? printing.trim().slice(0, 40) : null,
      location,
      processingTime,
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

  /**
   * Khớp từ khoá kiểu token: chuẩn hoá (lowercase + bỏ ký tự đặc biệt như + | -),
   * yêu cầu MỌI token của keyword xuất hiện (substring) trong tên sản phẩm.
   * → "bella canvas 3001" khớp "Bella + Canvas 3001"; "sweat" khớp "Sweatshirt".
   */
  private matchKeyword(name: string, kw: string): boolean {
    if (!kw) return true;
    const norm = (x: string) =>
      x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const nameN = norm(name);
    return norm(kw)
      .split(' ')
      .filter(Boolean)
      .every((t) => nameN.includes(t));
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
