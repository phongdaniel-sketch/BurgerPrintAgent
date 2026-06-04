# Quickstart: NestJS Backend Foundation (cài đặt ≤ 10 phút)

**Feature**: 001-nestjs-backend-foundation

Mục tiêu: từ máy sạch tới một endpoint hội thoại hoạt động trong ≤ 10 phút (SC-001).

## Yêu cầu nền tảng

- Docker + Docker Compose (khuyến nghị — không cần cài Node/Redis thủ công), **hoặc**
- Node.js 20 LTS + một Redis 7 đang chạy (cách thủ công).

## Cách 1 — Docker Compose (khuyến nghị)

```bash
cd backend
cp .env.example .env
# Mở .env, điền: BURGERPRINTS_API_KEY, LLM_PROVIDER (anthropic|openai) + key tương ứng
docker compose up --build
```

Compose khởi chạy 2 service: `app` (NestJS) + `redis`. Khi log báo `Nest application successfully started`:

```bash
# 1) Health
curl http://localhost:3000/health

# 2) Tạo phiên
SID=$(curl -s -XPOST http://localhost:3000/conversations | jq -r .sessionId)

# 3) Hỏi (non-stream fallback, dễ xem kết quả)
curl -s -XPOST http://localhost:3000/conversations/$SID/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8, gợi ý xưởng/SKU?"}' | jq

# 4) Hỏi streaming (SSE)
curl -N "http://localhost:3000/conversations/$SID/stream?message=So%20sanh%20gia%20Hoodie%20giua%20cac%20xuong"
```

## Cách 2 — Chạy local (Node + Redis sẵn có)

```bash
cd backend
cp .env.example .env        # điền secret + REDIS_URL=redis://localhost:6379
npm install
npm run start:dev
```

## Biến môi trường (.env)

| Biến | Bắt buộc | Mô tả |
|------|----------|------|
| `PORT` | không (default 3000) | Cổng HTTP |
| `REDIS_URL` | có | vd `redis://redis:6379` (compose) hoặc `redis://localhost:6379` |
| `SESSION_TTL_SECONDS` | không (default 3600) | TTL phiên |
| `MAX_CONTEXT_TURNS` | không (default 12) | Số lượt nạp làm ngữ cảnh |
| `LLM_PROVIDER` | có | `anthropic` hoặc `openai` |
| `ANTHROPIC_API_KEY` | conditional | bắt buộc nếu provider=anthropic |
| `OPENAI_API_KEY` | conditional | bắt buộc nếu provider=openai |
| `BURGERPRINTS_API_BASE_URL` | có | base URL API v2.0 |
| `BURGERPRINTS_API_KEY` | có | key do BTC cấp |
| `CATALOG_CACHE_TTL_SECONDS` | không (default 300) | TTL cache catalog |

> KHÔNG commit `.env`. `.env.example` chỉ chứa placeholder rỗng (FR-008, SC-004).

## Kiểm chứng nhanh (acceptance)

- [ ] `GET /health` trả `status: ok` (Redis up) — FR-010
- [ ] Thiếu một biến bắt buộc → app **không** khởi động và log nêu đích danh biến — SC-006
- [ ] SSE stream phát các `event: token` dần rồi `event: done` — FR-002, SC-002
- [ ] Hỏi nối tiếp trong cùng `sessionId` giữ được ngữ cảnh — FR-003, SC-003
- [ ] Hai phiên khác nhau không trộn lẫn lịch sử — FR-005, SC-005
