# Phase 1 Data Model: NestJS Backend Foundation

**Feature**: 001-nestjs-backend-foundation | **Date**: 2026-06-04

Mô hình dữ liệu lưu trên Redis (không RDBMS). Mọi key có namespace `session:` và áp TTL.

## Entity: ConversationSession

Đại diện một chuỗi hội thoại liên tục với một seller.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid v4) | Định danh phiên; sinh khi `POST /conversations` |
| `language` | `'vi' \| 'en' \| null` | Ngôn ngữ phát hiện ở lượt đầu; null tới khi xác định |
| `createdAt` | ISO datetime string | Thời điểm tạo |
| `updatedAt` | ISO datetime string | Cập nhật mỗi lượt |
| `ttlSeconds` | number | TTL hiện hành (từ `SESSION_TTL_SECONDS`) |

**Redis representation**:
- `session:{id}` → Hash: `{ language, createdAt, updatedAt }`
- `EXPIRE session:{id} {ttlSeconds}`, refresh mỗi lượt (FR-014).

**Validation rules**:
- `id` phải tồn tại (key có) trước khi stream; nếu không → 404 (FR: edge case session không tồn tại/hết hạn).
- `language` đặt một lần ở lượt đầu, các lượt sau giữ nguyên (FR-007).

## Entity: ConversationTurn

Một lượt: câu hỏi của seller hoặc câu trả lời của agent.

| Field | Type | Notes |
|-------|------|-------|
| `role` | `'user' \| 'assistant'` | Vai trò |
| `content` | string | Nội dung văn bản |
| `ts` | ISO datetime string | Thời điểm |

**Redis representation**:
- `session:{id}:turns` → List of JSON strings (RPUSH, đọc theo thứ tự LRANGE).
- Cùng TTL với `session:{id}`.

**Relationships**: nhiều `ConversationTurn` thuộc một `ConversationSession`. Lịch sử turns (rút gọn theo `MAX_CONTEXT_TURNS`) được nạp làm ngữ cảnh cho agent ở lượt kế (FR-003).

## Entity: AgentChunk (transient — không lưu Redis)

Đơn vị phát ra từ `AgentRuntime.run()` để map sang SSE event.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `'token' \| 'tool' \| 'error' \| 'done'` | Loại chunk → SSE `event` |
| `data` | string \| object | `token`: text phần; `tool`: mô tả gọi công cụ; `error`: thông báo lỗi; `done`: tổng kết |

**State flow của một lượt streaming**:
```
(0..n) token  → [optional tool ...] → token ... → done
                         │
                         └─(lỗi bất kỳ lúc nào)→ error → (kết thúc)
```
- `done` hoặc `error` là chunk cuối; sau đó observable complete → SSE đóng sạch (FR-011, FR-013).

## Entity: AppConfig (vận hành — nạp từ env, không lưu Redis)

Tập cấu hình typed (namespaced).

| Namespace | Keys | Required |
|-----------|------|----------|
| `app` | `PORT` | có (default 3000) |
| `redis` | `REDIS_URL` | có |
| `session` | `SESSION_TTL_SECONDS`, `MAX_CONTEXT_TURNS` | có (có default) |
| `llm` | `LLM_PROVIDER`, `ANTHROPIC_API_KEY` \| `OPENAI_API_KEY` | provider bắt buộc; key conditional theo provider |
| `burgerprints` | `BURGERPRINTS_API_BASE_URL`, `BURGERPRINTS_API_KEY`, `CATALOG_CACHE_TTL_SECONDS` | có |

**Validation**: joi schema, fail-fast khi bootstrap nếu thiếu/không hợp lệ (FR-009, SC-006). Không field nào có default chứa secret.

## Entity: CatalogCacheItem (cache — Redis, TTL ngắn)

Kết quả tra cứu BurgerPrints API v2.0 được cache.

| Field | Type | Notes |
|-------|------|-------|
| key | `catalog:{hash(query)}` | Khóa cache theo tham số truy vấn |
| value | JSON | Payload trả về từ API v2.0 |
| ttl | number | `CATALOG_CACHE_TTL_SECONDS` |

**Rationale**: giảm gọi lặp API trong một phiên (R7). Cache miss → gọi API thật → set cache.
