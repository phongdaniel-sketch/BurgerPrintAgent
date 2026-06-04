# Implementation Plan: NestJS Backend Foundation cho BurgerPrints Chatbot Agent

**Branch**: `001-nestjs-backend-foundation` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-nestjs-backend-foundation/spec.md`

## Summary

Dựng khung backend NestJS (TypeScript) cho AI chatbot agent của BurgerPrints. Backend expose một endpoint hội thoại streaming qua **SSE**, ủy thác vòng đời hội thoại cho **pi-agent-core** (tích hợp dạng **thư viện in-process TS/JS** sau một interface `AgentRuntime`), lưu **session/conversation state + cache** trên **Redis**, lấy dữ liệu catalog từ **BurgerPrints API v2.0**, và nạp toàn bộ credentials từ **env** qua `ConfigModule` có validation. Đi kèm `docker-compose` (app + redis) để cài đặt ≤ 10 phút.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 20 LTS

**Primary Dependencies**: NestJS 10 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`), `@nestjs/config` + `joi` (config validation), `ioredis` (Redis client), `pi-agent-core` (in-process agent runtime — wrap sau interface `AgentRuntime`), `@nestjs/axios`/`axios` (BurgerPrints API client), `@nestjs/terminus` (health check)

**Storage**: Redis 7 — conversation/session state (hash/list theo `session:{id}`) + cache catalog (key TTL). Không dùng RDBMS ở feature nền tảng này.

**Testing**: Jest (unit + e2e của NestJS), `supertest` cho HTTP/SSE e2e

**Target Platform**: Linux server (container), chạy local qua docker-compose

**Project Type**: Web service (backend đơn lẻ; chưa kèm frontend trong feature này)

**Performance Goals**: Token đầu tiên của agent xuất hiện ≤ 3s (SC-002); phục vụ ≥ 10 phiên song song độc lập (SC-005)

**Constraints**: Không hardcode secret (FR-008); validate env khi bootstrap (FR-009); cài đặt ≤ 10 phút (SC-001); SSE phải đóng luồng sạch khi lỗi/ngắt kết nối (FR-011, FR-013)

**Scale/Scope**: Feature foundation — 1 conversation endpoint (SSE) + 1 non-stream fallback + health; ~6 module NestJS. Quy mô demo/giám khảo (chục phiên đồng thời), không tối ưu cho production-scale.

**Resolved unknowns** (từ clarify):
- pi-agent-core = thư viện in-process TS/JS → wrap sau port `AgentRuntime` để cô lập phụ thuộc và test được bằng fake.
- LLM provider = provider-agnostic qua env (`LLM_PROVIDER` + `<PROVIDER>_API_KEY`); model cụ thể chốt ở implement.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution (`​.specify/memory/constitution.md`) hiện ở dạng template chưa thiết lập nguyên tắc cụ thể → **không có ràng buộc cứng nào để vi phạm**. Áp dụng best-practice mặc định và tự ràng buộc:

- **Tách mối quan tâm / module hóa** (FR-012): mỗi tích hợp ngoài (agent runtime, redis, burgerprints) nằm sau một module + port interface → PASS.
- **Cấu hình an toàn** (FR-008/009): secret chỉ qua env + validation schema → PASS.
- **Simplicity / YAGNI**: không thêm RDBMS, message queue, auth phức tạp ở feature nền tảng → PASS.
- **Testability**: các port có fake/double để test SSE và session store không cần dịch vụ thật → PASS.

Không có violation cần ghi vào Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-nestjs-backend-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (HTTP/SSE contracts)
│   ├── conversation-sse.md
│   └── openapi.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── main.ts                      # bootstrap, bật CORS + global pipes
│   ├── app.module.ts                # gắn ConfigModule + các feature module
│   ├── config/
│   │   ├── config.module.ts         # @nestjs/config global
│   │   ├── env.validation.ts        # joi schema: validate env khi bootstrap
│   │   └── configuration.ts         # typed config namespaces (app/redis/llm/burgerprints)
│   ├── redis/
│   │   ├── redis.module.ts          # provider ioredis (token REDIS_CLIENT)
│   │   └── redis.service.ts         # wrapper get/set/ttl/health
│   ├── session/
│   │   ├── session.module.ts
│   │   ├── session.service.ts       # CRUD lịch sử phiên trên Redis (TTL)
│   │   └── session.types.ts         # Session, Turn (Key Entities)
│   ├── agent/
│   │   ├── agent.module.ts
│   │   ├── agent-runtime.port.ts    # interface AgentRuntime { run(): AsyncIterable<AgentChunk> }
│   │   ├── pi-agent-core.runtime.ts # adapter bọc pi-agent-core (in-process)
│   │   └── agent.types.ts           # AgentChunk (token|tool|error|done)
│   ├── burgerprints/
│   │   ├── burgerprints.module.ts
│   │   └── burgerprints.service.ts  # client API v2.0 + cache qua RedisService
│   ├── conversation/
│   │   ├── conversation.module.ts
│   │   ├── conversation.controller.ts  # POST /conversations, GET (SSE) /conversations/:id/stream
│   │   ├── conversation.service.ts     # ghép session + agent runtime, sinh luồng chunk
│   │   └── dto/                         # CreateMessageDto, ...
│   └── health/
│       └── health.controller.ts     # GET /health (terminus: redis ping)
├── test/
│   ├── unit/                        # session.service, config validation, runtime adapter (fake)
│   └── e2e/                         # conversation SSE flow, health (supertest)
├── .env.example                     # mẫu env, KHÔNG chứa secret thật
├── Dockerfile
├── docker-compose.yml               # app + redis (cài ≤ 10 phút)
├── nest-cli.json
├── tsconfig.json
├── package.json
└── README.md                        # hướng dẫn cài đặt ≤ 10 phút
```

**Structure Decision**: Single backend service dưới `backend/` (Project Type = web service, chưa có frontend). Mỗi tích hợp bên ngoài (agent runtime / redis / burgerprints) đặt sau một module + port riêng để thỏa FR-012 và cho phép thay thế/test bằng fake. `conversation` là module điều phối (orchestrator) ghép `session` + `agent`.

## Complexity Tracking

> Không có vi phạm Constitution Check → bảng trống.
