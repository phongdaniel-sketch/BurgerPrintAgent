# BurgerPrints Chatbot Agent — Backend (NestJS)

Nền tảng backend cho AI chatbot agent của BurgerPrints (BP1 – POD Catalog Assistant).
Cung cấp API hội thoại nhiều lượt, **streaming qua SSE**, runtime **pi-agent-core**
(in-process, sau port `AgentRuntime`), **Redis** cho session/cache, cấu hình từ env.

> Feature: `001-nestjs-backend-foundation`. Spec & thiết kế: `../specs/001-nestjs-backend-foundation/`.

## Kiến trúc (tóm tắt)

```
Client ──SSE/HTTP──> NestJS
                       ├─ auth/          (Xác thực JWT, Google OAuth, Đăng ký/Đăng nhập)
                       ├─ conversation/  (controller @Sse + service điều phối + MongoDB DB)
                       ├─ agent/         (port AgentRuntime → pi-agent-core)
                       ├─ session/       (lịch sử phiên trên Redis, TTL)
                       ├─ users/         (Quản lý người dùng, MongoDB)
                       ├─ burgerprints/  (client API v2.0 + cache Redis)
                       ├─ redis/ config/ health/ common/ database/
                       ├─ Redis (session state + cache)
                       └─ MongoDB (lưu trữ user, refresh tokens, conversations, messages)
```

## Cài đặt ≤ 10 phút

### Cách 1 — Docker Compose (khuyến nghị)

```bash
cd backend
cp .env.example .env
# Điền BURGERPRINTS_API_KEY + (ANTHROPIC_API_KEY hoặc OPENAI_API_KEY) + JWT_SECRET
docker compose up --build
```

App: <http://localhost:3000>. Redis và MongoDB chạy kèm trong compose (port 6379 và 27017).

### Cách 2 — Local (cần Node 20+, Redis và MongoDB đang chạy)

```bash
cd backend
cp .env.example .env        # REDIS_URL=redis://localhost:6379, MONGODB_URI=mongodb://localhost:27017/burgerprints
npm install
npm run start:dev
```

## Thử nhanh (curl)

```bash
# Health
curl http://localhost:3000/health

# Đăng ký
curl -XPOST http://localhost:3000/auth/register -H 'Content-Type: application/json' -d '{"email": "seller@example.com", "password": "Password123"}'
# Đăng nhập
TOKENS=$(curl -s -XPOST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email": "seller@example.com", "password": "Password123"}')
JWT=$(echo $TOKENS | jq -r .accessToken)

# Tạo phiên
SID=$(curl -s -XPOST http://localhost:3000/conversations -H "Authorization: Bearer $JWT" | jq -r .sessionId)

# Hỏi (non-stream)
curl -s -XPOST http://localhost:3000/conversations/$SID/messages \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8?"}' | jq

# Hỏi streaming (SSE)
curl -N -H "Authorization: Bearer $JWT" "http://localhost:3000/conversations/$SID/stream?message=So%20sanh%20gia%20Hoodie"
```

## API

### Auth API

| Method | Path | Mô tả |
|--------|------|------|
| POST | `/auth/register` | Đăng ký tài khoản Local |
| POST | `/auth/login` | Đăng nhập tài khoản Local (lock 15m sau 5 lần sai) |
| POST | `/auth/refresh` | Cấp lại Access Token |
| POST | `/auth/logout` | Đăng xuất (thu hồi Refresh Token) |
| GET  | `/auth/google` | Đăng nhập qua Google (OAuth) |
| GET  | `/auth/me` | Lấy thông tin user hiện tại (cần JWT) |

### Conversation API

| Method | Path | Mô tả | Yêu cầu |
|--------|------|------|---------|
| POST | `/conversations` | Tạo phiên → `{ sessionId }` | JWT |
| GET  | `/conversations/:id/stream?message=...` | Hội thoại **SSE** (events: `token`/`tool`/`error`/`done`) | JWT |
| POST | `/conversations/:id/messages` | Fallback non-stream → `{ reply }` | JWT |
| GET  | `/health` | Readiness (ping Redis + MongoDB) | Public |

Chi tiết: [`../specs/001-nestjs-backend-foundation/contracts/`](../specs/001-nestjs-backend-foundation/contracts/).

## Biến môi trường

| Biến | Bắt buộc | Default | Mô tả |
|------|----------|---------|------|
| `PORT` | không | 3000 | Cổng HTTP |
| `REDIS_URL` | **có** | — | vd `redis://localhost:6379` (compose tự đặt `redis://redis:6379`) |
| `MONGODB_URI` | **có** | — | URI MongoDB (vd: `mongodb://localhost:27017/burgerprints`) |
| `JWT_SECRET` | **có** | — | Secret key để ký JWT |
| `JWT_ACCESS_EXPIRES_IN` | không | 15m | Thời gian sống của Access Token |
| `JWT_REFRESH_EXPIRES_IN` | không | 7d | Thời gian sống của Refresh Token |
| `GOOGLE_CLIENT_ID` | không | — | OAuth Client ID (Google) |
| `GOOGLE_CLIENT_SECRET` | không | — | OAuth Client Secret (Google) |
| `GOOGLE_CALLBACK_URL` | không | — | OAuth Callback URL |
| `SESSION_TTL_SECONDS` | không | 3600 | TTL phiên |
| `MAX_CONTEXT_TURNS` | không | 12 | Số lượt nạp làm ngữ cảnh |
| `LLM_PROVIDER` | **có** | anthropic | `anthropic` \| `openai` |
| `ANTHROPIC_API_KEY` | conditional | — | bắt buộc nếu provider=anthropic |
| `OPENAI_API_KEY` | conditional | — | bắt buộc nếu provider=openai |
| `OPENAI_BASE_URL` | không | — | override endpoint OpenAI-compatible (proxy/Azure/OpenRouter/local) |
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

Trong test, provider `AGENT_RUNTIME` được override bằng test-double ([`test/fake-agent.runtime.ts`](test/fake-agent.runtime.ts)) để không gọi LLM thật.

## Lệnh

```bash
npm run start:dev   # dev watch
npm run build       # build production
npm start           # chạy đã build
npm test            # unit tests
npm run test:e2e    # e2e tests (SSE, session isolation)
npm run lint        # eslint --fix
```
