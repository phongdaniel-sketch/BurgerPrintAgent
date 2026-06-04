# BurgerPrintsAgent — POD Catalog Assistant

> Từ hàng trăm xưởng đến một SKU hoàn hảo — để AI agent làm phần nặng nhọc.

AI chatbot hội thoại giúp **sellers POD** trên BurgerPrints tìm kiếm, so sánh và chọn sản phẩm
fulfillment (sản phẩm × xưởng × SKU × giá × ship) qua **ngôn ngữ tự nhiên (VN/EN)**, dùng
**BurgerPrints API v2.0** làm nguồn dữ liệu thật. Đề tài **BP1** (nhà tài trợ: BurgerPrints).

## ✨ Tính năng (dự kiến)

> ⚠️ **Trạng thái: đang phát triển.** Đây là phạm vi/mục tiêu của sản phẩm. Hiện mới
> hoàn thiện phần **nền tảng backend** (xem [Roadmap](#️-roadmap)); các tính năng dưới đây
> là định hướng dự kiến, chưa hoàn thiện toàn bộ.

- 💬 **Hội thoại nhiều lượt**, giữ ngữ cảnh — không phải form filter tĩnh
- ⚡ **Streaming real-time qua SSE** — câu trả lời hiện dần token-by-token
- 🤖 **Agent có tool-calling** — tự tra cứu catalog BurgerPrints khi cần (không bịa dữ liệu)
- 🌐 **Song ngữ VN/EN** — trả lời theo ngôn ngữ của câu hỏi
- 🔐 **Xác thực JWT + Google OAuth** — bảo mật endpoint, định danh người dùng
- 🧠 **Lưu trữ kép (MongoDB + Redis)** — lưu lịch sử dài hạn (MongoDB) + cache phiên (Redis)
- ⚙️ **Cấu hình từ env + validation fail-fast** — không hardcode secret

## 🏗️ Kiến trúc

```
                    ┌──────────────────────── backend/ (NestJS) ────────────────────────┐
  Client ──SSE──►   │  conversation (@Sse)  ──►  AgentRuntime (port)                     │
  (web/CLI/...)     │  auth (JWT/OAuth)               │                                  │
                    │        ▼                        ▼                                  │
                    │   session (Redis)         pi-agent-core                            │
                    │   MongoDB (history)       (in-process, ESM, push→pull)             │
                    │        │                        │                                  │
                    │        ▼                        ▼ tool: burgerprints_search        │
                    │     Redis + MongoDB       BurgerPrints API v2.0 (+ cache Redis)    │
                    └────────────────────────────────────────────────────────────────────┘
```

- Mỗi tích hợp ngoài nằm sau **module + port** riêng → cô lập, dễ test (override port bằng double trong test).
- Runtime agent: [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core) (bộ "Pi" toolkit), tích hợp in-process sau port `AgentRuntime`.

## 🚀 Cài đặt ≤ 10 phút

```bash
cd backend
cp .env.example .env
# Điền BURGERPRINTS_API_KEY + (ANTHROPIC_API_KEY hoặc OPENAI_API_KEY) + JWT_SECRET
docker compose up --build
```

Thử ngay:

```bash
curl http://localhost:3000/health
SID=$(curl -s -XPOST http://localhost:3000/conversations | jq -r .sessionId)
curl -N "http://localhost:3000/conversations/$SID/stream?message=Tim%20T-shirt%20cho%20thi%20truong%20My"
```

👉 Chi tiết cài đặt (Docker / local), bảng biến môi trường, lệnh dev: [`backend/README.md`](backend/README.md).

## 📡 API

| Method | Path | Mô tả | Yêu cầu |
|--------|------|------|---------|
| POST | `/auth/login` | Đăng nhập tài khoản Local | Public |
| POST | `/conversations` | Tạo phiên → `{ sessionId }` | JWT |
| GET | `/conversations/:id/stream?message=...` | Hội thoại **SSE** (`token`/`tool`/`error`/`done`) | JWT |
| POST | `/conversations/:id/messages` | Fallback non-stream → `{ reply }` | JWT |
| GET | `/health` | Readiness (ping Redis + MongoDB) | Public |

Contract đầy đủ: [`specs/001-nestjs-backend-foundation/contracts/`](specs/001-nestjs-backend-foundation/contracts/).

## 🧰 Tech stack

**NestJS 10** (TypeScript, Node 20) · **SSE** streaming · **@earendil-works/pi-agent-core** (agent runtime)
· **Redis 7** (session + cache) · **MongoDB 7** (users, auth, history) · **joi** (env validation)
· **Passport (JWT + OAuth2)** · **Docker Compose** · **Jest** (10 unit + 5 e2e)

## 📂 Cấu trúc

```
backend/                  # NestJS backend (xem backend/README.md)
  src/{conversation,agent,session,burgerprints,redis,config,health,common}
  test/{unit,e2e}
specs/001-nestjs-backend-foundation/   # spec-kit: spec, plan, research, data-model, contracts, tasks
docs/                     # detai.md (đề bài) + api-specs.md (BurgerPrints API v2)
```

Dự án phát triển theo [spec-kit](https://github.com/github/spec-kit) (specify → plan → tasks → implement).

## 🔐 Bảo mật

Mọi credential nạp từ env; **không hardcode**. `.env` đã gitignore — chỉ commit `.env.example` placeholder.

## 🗺️ Roadmap

- [x] Nền tảng backend (foundation): khung hội thoại SSE, port `AgentRuntime`, Redis session, BurgerPrints client
- [x] Xác thực (Auth): JWT, Google OAuth, MongoDB để lưu user và dữ liệu hội thoại (US4, US2)
- [ ] Hoàn thiện luồng agent tra cứu + so sánh catalog end-to-end
- [ ] System prompt tư vấn fulfillment chi tiết (so sánh giá/xưởng/margin)
- [ ] Tạo đơn hàng tự động (`POST /v2/order` + `sandbox`) — bonus đề bài
- [ ] Giao diện cho seller (web/CLI/Telegram)

> Tiến độ hiện tại: **nền tảng backend + auth + storage** (~50%). Các hạng mục còn lại đang triển khai.
