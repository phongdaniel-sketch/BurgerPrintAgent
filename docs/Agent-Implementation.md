# BurgerPrintsAgent — Implementation & Data Reference

> Tài liệu tổng hợp kỹ thuật (agent + tools + data sources + những fact đã verify). Mục đích: không mất context khi làm tiếp.
> Cập nhật: 2026-06-06.

---

## 1. Kiến trúc

```
Frontend (React/Vite, frontend/)  ──SSE──▶  NestJS backend (backend/)
  - chat UI (timeline "thinking" + tool results)        ├─ auth (JWT + Google OAuth, MongoDB)
  - sửa system prompt theo phiên                         ├─ conversation (controller @Sse) ──▶ AgentRuntime (port)
  - đóng gói được thành Chrome Extension (Side Panel)    │                                      └─ PiAgentCoreRuntime
                                                         ├─ session (Redis: hash + list + TTL)   (@earendil-works/pi-agent-core, ESM, push→pull)
                                                         ├─ burgerprints (API v2 client)
                                                         ├─ catalog-v1 (catalog-api v1 client) 🆕
                                                         ├─ memory (BM25 search_history)
                                                         ├─ logging (AgentLogger JSONL) 🆕
                                                         └─ Redis + MongoDB
```

- **Agent runtime**: `@earendil-works/pi-agent-core` (+ `@earendil-works/pi-ai`), ESM-only, **push-based** (subscribe events + `agent.prompt()`). Adapter bắc cầu push→pull thành `AsyncIterable<AgentChunk>` cho SSE. ESM import từ CommonJS phải dùng `new Function('m','return import(m)')`.
- **LLM**: provider-agnostic qua env. Model id phải là key registry pi-ai hợp lệ (`gpt-4o`, `claude-sonnet-4-5`). Proxy OpenAI-compatible: set `OPENAI_BASE_URL` → adapter override `model.id/baseUrl` + ép `api=openai-completions`.
- **SSE chunk types**: `token` | `thinking` | `tool` (running/done, kèm `count` + `results[]`) | `error` | `done`.

---

## 2. Data sources (2 API)

### A. BurgerPrints API v2 — `https://api.burgerprints.com/v2` (header `api-key`)
Catalog + orders. **Đặc điểm đã verify:**
- `GET /product` — 505 base product. Mặc định 10/trang NHƯNG **`page_size` (snake_case) hoạt động** → `?page=1&page_size=1000` lấy hết trong 1 call. KHÔNG search/filter server-side.
- `GET /product/{short_code}` — detail + `variations[]` (có thể vài nghìn SKU). Mỗi variation: `sku, size, color, color_hex, price, 2nd_price, addition_price, partner_id, partner_name`.
- `GET /product/outofstock` — SKU hết hàng (theo store của api-key). 193 entries với key hiện tại.
- `POST /v2/order` — tạo đơn (mặc định dùng `sandbox:true` → order_id prefix `ASAMPLE-`).
- **Thiếu**: phí/thời gian ship theo nước, factory rating.

### B. catalog-api v1 — `https://catalog-api.burgerprints.com/api/v1/catalogsV2` 🆕 **PUBLIC (không cần auth)**
Giàu hơn v2. Quan trọng nhất: **shipping theo xưởng theo nước**.
- `GET /search?pageSize=&pageIndex=` — list + `catalogObjects` (category).
- `GET /alias/{aliasName}` — detail (baseCost, **processingTime**, decorations, sizes, colors, locations, **print_area**, shipping*).
- `GET /decorations/filter?shortCode=X[&decoration=DTG]` — các **xưởng** hỗ trợ + processing time per partner (trong HTML `value`). KHÔNG cần param decoration.
- `GET /locations?shortCode=X&partnerId=Y` — **shipping per country**: `method, description (time), carriers, firstItemPrice, additionalItemPrice`.
- ✅ **`partnerId` ở đây KHỚP `partner_id` của v2** (Hatta=sJjQMlcq1vayqSbA, Rocky=e8LG0eYy3LkbDWsy) → dùng chung, không cần map.

---

## 3. Data model

```
Catalog (505 base products)
 └─ Product (short_code, vd USG5000)
     ├─ available_sizes[] · available_colors[] · html_desc (HTML) · print_area ["front","back","sleeve"]
     └─ variations[]  ← 1 variant = size × màu × XƯỞNG
          { sku, size, color, price (sp đầu), 2nd_price (từ sp 2), addition_price, partner_id, partner_name }
```
- **1 (màu, size) xuất hiện nhiều lần** — mỗi xưởng 1 dòng, **giá khác nhau**. Vd USG5000 Black-S: Zion $5.10, Sierra $5.20, Blanca $5.39… (12 xưởng) → 2586 variations.
- **Market** suy từ tiền tố short_code: `US..`/`EU..`/`AP..`=CN/`UK..`/`AU..`.
- **catalog_sku (khi đặt đơn)** = `{short_code}-{Color}-{Size}` (vd `USG5000-Black-S`) — **KHÁC** `variation.sku` (vd `USBG5000DTF-Black-S`).

---

## 4. Bộ tool (7 tool — agent gọi). **Tất cả description bằng tiếng Anh.**

| Tool | Params | Làm gì | Nguồn |
|------|--------|--------|-------|
| `search_products` | `category?, market?, max_base_cost?` | Tìm product. category khớp **full-text BM25** (name + html_desc → chất liệu/kỹ thuật in/đặc điểm), fuzzy+prefix, rank relevance. Enrich giá (rẻ nhất + xưởng + số màu), filter/sort theo giá. | v2 |
| `compare_factories` | `short_code` | So **tất cả xưởng** của 1 sp: min/max base cost, sku_count, **partner_id**, **processing_time**, sizes, colors. | v2 + catalog-v1 |
| `get_product_variants` | `short_code, color?, size?, factory?` | Liệt kê SKU (sku, **catalog_sku**, color, size, price, 2nd_price, partner_name, **in_stock**). | v2 (+ outofstock) |
| `get_shipping` 🆕 | `short_code, partner_id, country?` | Phí + thời gian ship của 1 xưởng tới từng nước (carrier, first/additional price). | catalog-v1 |
| `calculate_margin` 🆕 | `items[]{label,sell_price,base_cost,shipping_cost?}` | Tính margin **deterministic** (server-side) cho nhiều sp 1 call → tránh LLM tính sai. | (pure compute) |
| `create_order` | `shipping, items[], sandbox?` | Tạo đơn (mặc định sandbox). | v2 |
| `search_history` | `query` | BM25 (MiniSearch) trên TOÀN BỘ turns đã lưu (Redis) — khi user hỏi chuyện cũ ngoài context window. | Redis |

**Search matching** (`search_products` + `search_history`): dùng **MiniSearch (BM25)** — tokenize bỏ ký tự đặc biệt (`+`,`|`), fuzzy 0.2, prefix. → "bella canvas 3001" khớp "Bella + Canvas 3001". `search_products` index thêm `html_desc` (boost name:4) để search theo chất liệu.

**Margin**: agent PHẢI gọi `calculate_margin` (LLM tính nhẩm SAI — đã verify). `Margin% = (Sell − Base − Ship)/Sell × 100`, base_cost = giá thật từng sp, shipping_cost chỉ khi có số thật từ get_shipping. Min margin X% tại giá P → `max_base_cost = P×(1−X/100)`.

**SHORT_CODE RULE**: agent KHÔNG được đoán short_code — phải lấy từ kết quả `search_products` (đoán sai → API 400).

---

## 5. System prompt
- Mặc định: `defaultSystemPrompt()` trong `pi-agent-core.runtime.ts` (export để FE/controller dùng).
- **Custom per phiên**: `GET/PUT /conversations/:id/system-prompt` (lưu Redis `session:{id}:sysprompt`, TTL 7 ngày). GET trả thêm `tools[]` (AGENT_TOOLS_INFO) cho FE hiển thị.
- Ngôn ngữ: agent **mirror ngôn ngữ tin nhắn user** (không phân biệt cứng).
- `docs/SystemPrompt.md` (phongdaniel quản lý) — bản tham chiếu, có thể lệch với runtime.

---

## 6. Logging (debug) 🆕
- `AgentLogger` ghi JSONL ra `backend/logs/agent-turns.jsonl` (env `AGENT_LOG_FILE` để đổi). `logs/` đã gitignore.
- Mỗi turn: `turn_start` (message, history_turns, custom_prompt) · `tool` (name + **full args** + preview result) · `turn_end` (reply, finishReason, error, duration_ms).
- Xem live: `tail -f logs/agent-turns.jsonl | jq`.

---

## 7. Fact / quirk đã verify (curl thật)
- `addition_price` (phụ phí in 2 mặt) = **null 0/16234 variants** → API v2 không cung cấp. Đừng dựa vào để tính giá 2 mặt.
- `Processing Time` trong html_desc của v2 = **~0%**. Nhưng catalog-v1 `/decorations/filter` **CÓ** processing time per partner ("2-3 Business days").
- Material trong html_desc: ~40% sp (apparel). **Không nên regex-parse** (giòn) → để LLM đọc từ description.
- Out-of-stock: **theo từng store (theo api-key)**. `variation.sku` khớp exact `outofstock.sku` (vd EUBC3001 17/17) — nhưng vài entry có prefix khác (EUXG vs EUG) → coverage không 100%.
- Gildan 18600 Black: **0 SKU hết hàng** (đúng khi agent báo "còn hàng" cho black; nhưng 18600 nói chung có 14 SKU hết ở màu khác).
- `print_area` = ["front","back","sleeve"] (cấp product) — **chưa expose** trong tool.

---

## 8. Performance
- Latency 1 turn (cache warm): **~21s với gpt-4o thật** vs **~88s với vilao/gx-gpt-5.4** → **LLM/proxy là bottleneck**, không phải tool.
- Tool cost (cold): catalog list ~4.8s (cached sau) + enrich 80 detail ~6s (concurrency 10, 7.3MB, 27k variations). Cache Redis TTL 1800s.
- Hướng tối ưu (chưa làm): **price index** (enrich all 505 1 lần, cache → search tức thì), giảm payload tool, phân trang. Lưu ý: phân trang KHÔNG cứu latency budget-query (cần biết hết giá để sort).

---

## 9. Use case → tool mapping
| UC | Câu hỏi | Tool | Trạng thái |
|----|---------|------|-----------|
| UC-01 | T-shirt US <$8 | search_products | ✅ verify khớp API (USG5000 $5.10 Zion…) |
| UC-02 | So xưởng + ship EU rẻ nhất | search_products → compare_factories → get_shipping | ✅ (Rocky→Germany $5.75, total $19.75) |
| UC-03 | Margin tại giá bán | search_products(max_base_cost) + **calculate_margin** | ✅ (79.6%/71.0%/70.4% — đúng sau khi thêm tool; LLM trước tính sai 64.5%) |
| UC-04 | Màu/size + còn hàng | search_products → get_product_variants | ✅ (EUBC3001 Pink: S/3XL/4XL hết — đúng; fix bug đoán short_code) |
| UC-05 | Multi-turn / hỏi chuyện cũ | chain + search_history | ✅ (nhớ ZephyrWear ngoài context) |
| UC-06 | Tạo đơn (bonus) | create_order (sandbox) | ✅ (order_id ASAMPLE-…) |

---

## 10. Deployment
- **VPS**: `root@180.93.42.147` (Ubuntu 24.04). Public: **http://180.93.42.147/**
- Backend: `docker compose up -d --build` (app + redis + mongo) tại `/opt/burgerprints/backend`. Frontend: `npm run build` → nginx serve `frontend/dist` + proxy `/api` → `:3000` (buffering off cho SSE).
- Redeploy: `git pull && docker compose up -d --build` (+ FE `npm run build`).
- ⚠️ VPS chạy nhánh `main` — các tính năng đang ở branch/PR chưa merge thì CHƯA có trên VPS.

## 11. Env chính (`backend/.env`, gitignored)
`PORT, REDIS_URL, MONGODB_URI, JWT_SECRET, LLM_PROVIDER, LLM_MODEL, OPENAI_API_KEY, OPENAI_BASE_URL (rỗng=OpenAI thật), ANTHROPIC_API_KEY, BURGERPRINTS_API_BASE_URL, BURGERPRINTS_API_KEY, CATALOG_CACHE_TTL_SECONDS, MAX_CONTEXT_TURNS, SESSION_TTL_SECONDS, AGENT_LOG_FILE?, CATALOG_V1_BASE_URL?`

## 12. Git workflow (rule)
- **Luôn confirm trước commit & deploy.** KHÔNG commit thẳng `main` → feature branch + PR (`gh pr create`), không tự merge.
- PR đang mở: **#5 `feat/catalog-v1-shipping`** (get_shipping + processing_time + MiniSearch + full-text html_desc). Chưa commit: logging, FE (header icon, tool labels, EN UI).
