# Contract: Conversation API (HTTP + SSE)

**Feature**: 001-nestjs-backend-foundation

Base URL: `http://localhost:{PORT}` (mặc định 3000).

---

## 1. POST /conversations — tạo phiên

Tạo một phiên hội thoại mới.

**Request**: body rỗng (hoặc `{ "language": "vi" | "en" }` tùy chọn để cố định ngôn ngữ).

**Response 201**:
```json
{ "sessionId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Errors**: `503` nếu Redis không khả dụng.

---

## 2. GET /conversations/:sessionId/stream — hội thoại streaming (SSE)

Gửi một message và nhận câu trả lời của agent dạng streaming.

**Headers**: `Accept: text/event-stream`
**Query**: `message` (string, required) — câu hỏi của seller.

**Response 200**: `Content-Type: text/event-stream`. Chuỗi sự kiện SSE:

```text
event: token
data: {"text":"Chào"}

event: token
data: {"text":" bạn,"}

event: tool
data: {"name":"burgerprints.searchProducts","status":"running"}

event: token
data: {"text":" mình gợi ý..."}

event: done
data: {"finishReason":"stop"}
```

**Event types** (map từ `AgentChunk.type`):

| event | data shape | Ý nghĩa |
|-------|-----------|---------|
| `token` | `{ "text": string }` | Một phần câu trả lời (FR-002) |
| `tool` | `{ "name": string, "status": "running"\|"done" }` | Agent gọi công cụ/dữ liệu |
| `error` | `{ "message": string, "code": string }` | Lỗi runtime/datasource — luồng kết thúc sạch (FR-011, SC-007) |
| `done` | `{ "finishReason": string }` | Lượt trả lời hoàn tất (FR: tín hiệu kết thúc rõ ràng) |

**Behavior**:
- Lượt user và lượt assistant (sau khi gộp các token) đều được lưu vào `session:{id}:turns` (FR-003).
- TTL của phiên được refresh (FR-014).
- Client ngắt kết nối → server teardown observable, dừng runtime, giải phóng tài nguyên (FR-013).

**Errors**:
- `404` nếu `sessionId` không tồn tại / hết hạn (trước khi mở stream).
- Lỗi giữa luồng → KHÔNG đổi HTTP status (đã 200), thay vào đó phát `event: error` rồi đóng.

---

## 3. POST /conversations/:sessionId/messages — fallback non-stream

Tiện cho curl/test: gửi message, nhận nguyên câu trả lời (gộp token).

**Request**:
```json
{ "message": "Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8" }
```

**Response 200**:
```json
{
  "sessionId": "550e8400-...",
  "reply": "Với T-shirt đi Mỹ giá vốn < $8, mình gợi ý...",
  "finishReason": "stop"
}
```

**Errors**: `404` session không tồn tại; `502` agent/datasource lỗi (kèm `{ "message", "code" }`).

---

## 4. GET /health — readiness

**Response 200**:
```json
{ "status": "ok", "info": { "redis": { "status": "up" } } }
```
**Response 503**: khi Redis down (`{ "status": "error", ... }`).
