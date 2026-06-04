# BurgerPrints Chatbot Agent — Backend (NestJS)

Nền tảng backend cho AI chatbot agent của BurgerPrints (BP1 – POD Catalog Assistant).
Cung cấp API hội thoại nhiều lượt, **streaming qua SSE**, runtime **pi-agent-core**
(in-process, sau port `AgentRuntime`), **Redis** cho session/cache, cấu hình từ env.

> Feature: `001-nestjs-backend-foundation`. Spec & thiết kế: `../specs/001-nestjs-backend-foundation/`.

## Kiến trúc (tóm tắt)

```
Client ──SSE/HTTP──> NestJS
                       ├─ conversation/  (controller @Sse + service điều phối)
                       ├─ agent/         (port AgentRuntime → pi-agent-core | fake)
                       ├─ session/       (lịch sử phiên trên Redis, TTL)
                       ├─ burgerprints/  (client API v2.0 + cache Redis)
                       ├─ redis/ config/ health/ common/
                       └─ Redis (session state + cache)
```

## Cài đặt ≤ 10 phút

### Cách 1 — Docker Compose (khuyến nghị)

```bash
cd backend
cp .env.example .env
# Điền BURGERPRINTS_API_KEY; để demo nhanh giữ USE_FAKE_AGENT=true (không cần key LLM)
docker compose up --build
```

App: <http://localhost:3000>. Redis chạy kèm trong compose.

### Cách 2 — Local (cần Node 20+ và Redis đang chạy)

```bash
cd backend
cp .env.example .env        # REDIS_URL=redis://localhost:6379
npm install
npm run start:dev
```

## Thử nhanh (curl)

```bash
# Health
curl http://localhost:3000/health

# Tạo phiên
SID=$(curl -s -XPOST http://localhost:3000/conversations | jq -r .sessionId)

# Hỏi (non-stream)
curl -s -XPOST http://localhost:3000/conversations/$SID/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8?"}' | jq

# Hỏi streaming (SSE)
curl -N "http://localhost:3000/conversations/$SID/stream?message=So%20sanh%20gia%20Hoodie"
```

## API

| Method | Path | Mô tả |
|--------|------|------|
| POST | `/conversations` | Tạo phiên → `{ sessionId }` |
| GET  | `/conversations/:id/stream?message=...` | Hội thoại **SSE** (events: `token`/`tool`/`error`/`done`) |
| POST | `/conversations/:id/messages` | Fallback non-stream → `{ reply }` |
| GET  | `/health` | Readiness (ping Redis) |

Chi tiết: [`../specs/001-nestjs-backend-foundation/contracts/`](../specs/001-nestjs-backend-foundation/contracts/).

## Biến môi trường

| Biến | Bắt buộc | Default | Mô tả |
|------|----------|---------|------|
| `PORT` | không | 3000 | Cổng HTTP |
| `REDIS_URL` | **có** | — | vd `redis://localhost:6379` (compose tự đặt `redis://redis:6379`) |
| `SESSION_TTL_SECONDS` | không | 3600 | TTL phiên |
| `MAX_CONTEXT_TURNS` | không | 12 | Số lượt nạp làm ngữ cảnh |
| `LLM_PROVIDER` | **có** | anthropic | `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` | conditional | — | bắt buộc nếu provider=anthropic & `USE_FAKE_AGENT=false` |
| `OPENAI_API_KEY` | conditional | — | bắt buộc nếu provider=openai & `USE_FAKE_AGENT=false` |
| `USE_FAKE_AGENT` | không | false | `true` → runtime giả (chạy/demo khi chưa có key) |
| `BURGERPRINTS_API_BASE_URL` | **có** | — | base URL API v2.0 |
| `BURGERPRINTS_API_KEY` | **có** | — | key BurgerPrints (BTC cấp) |
| `CATALOG_CACHE_TTL_SECONDS` | không | 300 | TTL cache catalog |

> Thiếu biến **bắt buộc** → app **không** khởi động và log nêu đích danh biến (fail-fast).
> KHÔNG commit `.env`. Mọi secret nạp từ env (không hardcode).

## pi-agent-core

Dùng package thật **`@earendil-works/pi-agent-core`** (+ `@earendil-works/pi-ai`) — bộ "Pi" toolkit,
ESM-only. Lưu ý: bare `pi-agent-core` trên npm chỉ là placeholder; package thật là scoped.

Tích hợp dạng **thư viện in-process** sau port [`src/agent/agent-runtime.port.ts`](src/agent/agent-runtime.port.ts).
Adapter [`src/agent/pi-agent-core.runtime.ts`](src/agent/pi-agent-core.runtime.ts) khởi tạo `new Agent({...})`
với `getModel(provider, model)`, `subscribe` các event của pi và bắc cầu **push → pull** vào
`AsyncIterable<AgentChunk>` để controller đẩy ra SSE. Tool `burgerprints_search` cho agent tra cứu
catalog thật. Đổi LLM qua `LLM_PROVIDER`/`LLM_MODEL`; pi-ai tự đọc `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`.

Khi chưa có key, đặt `USE_FAKE_AGENT=true` để dùng `FakeAgentRuntime` (demo/test không cần LLM).

## Lệnh

```bash
npm run start:dev   # dev watch
npm run build       # build production
npm start           # chạy đã build
npm test            # unit tests
npm run test:e2e    # e2e tests (SSE, session isolation)
npm run lint        # eslint --fix
```
