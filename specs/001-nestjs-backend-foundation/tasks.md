---
description: "Task list for NestJS Backend Foundation"
---

# Tasks: NestJS Backend Foundation cho BurgerPrints Chatbot Agent

**Input**: Design documents from `/specs/001-nestjs-backend-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Bao gồm một số e2e/unit trọng yếu (SSE streaming, session isolation, env fail-fast) vì hành vi streaming/persistence khó xác minh thủ công. Không áp dụng TDD đầy đủ.

**Organization**: Tasks nhóm theo user story. Mọi đường dẫn gốc tại `backend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (file khác nhau, không phụ thuộc task chưa xong)
- **[Story]**: US1/US2/US3 theo spec.md

## Path Conventions

- Web service đơn lẻ: mã nguồn dưới `backend/src/`, test dưới `backend/test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Khởi tạo dự án NestJS và cấu trúc cơ bản.

- [X] T001 Tạo NestJS project skeleton dưới `backend/` (package.json, tsconfig.json, nest-cli.json, src/main.ts, src/app.module.ts) cho NestJS 10 + Node 20
- [X] T002 Cài dependencies trong `backend/package.json`: `@nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config joi ioredis @nestjs/axios axios @nestjs/terminus rxjs uuid` và devDeps `typescript jest ts-jest @types/jest supertest @types/supertest @nestjs/testing eslint prettier`
- [X] T003 [P] Cấu hình ESLint + Prettier (`backend/.eslintrc.cjs`, `backend/.prettierrc`) và scripts `start/start:dev/build/test/test:e2e/lint` trong `backend/package.json`
- [X] T004 [P] Tạo `backend/.gitignore` (node_modules, dist, .env) và `backend/.env.example` placeholder rỗng cho mọi biến ở data-model AppConfig

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Hạ tầng lõi dùng chung — phải xong trước mọi user story.

**⚠️ CRITICAL**: Không story nào bắt đầu trước khi phase này hoàn tất.

- [X] T005 [P] Tạo typed configuration trong `backend/src/config/configuration.ts` (namespaces: app, redis, session, llm, burgerprints) đọc từ `process.env`
- [X] T006 [P] Tạo joi env schema trong `backend/src/config/env.validation.ts`: validate bắt buộc + conditional key theo `LLM_PROVIDER`; fail-fast với thông báo nêu đích danh biến thiếu (FR-009, SC-006)
- [X] T007 Tạo `backend/src/config/config.module.ts` dùng `@nestjs/config` global với `validationSchema` từ T006 và `load` từ T005; gắn vào `app.module.ts`
- [X] T008 [P] Tạo Redis module trong `backend/src/redis/redis.module.ts` + `redis.service.ts` (provider `ioredis` token `REDIS_CLIENT`, wrapper get/set/expire/rpush/lrange/hset/hgetall/ping)
- [X] T009 [P] Tạo `backend/src/session/session.types.ts` (ConversationSession, ConversationTurn theo data-model.md)
- [X] T010 Tạo `backend/src/session/session.service.ts` + `session.module.ts`: createSession (uuid), appendTurn, getTurns, touch/refresh TTL, getSession trên Redis (hash `session:{id}` + list `session:{id}:turns`) — entity dùng chung US1/US2
- [X] T011 [P] Tạo global exception filter trong `backend/src/common/all-exceptions.filter.ts` + logger interceptor để chuẩn hóa lỗi có cấu trúc (FR-011)
- [X] T012 Hoàn thiện bootstrap `backend/src/main.ts`: bật CORS, global ValidationPipe, đăng ký exception filter; đọc PORT từ config
- [X] T013 [P] Tạo health module `backend/src/health/health.controller.ts` dùng `@nestjs/terminus` ping Redis (`GET /health`) (FR-010)

**Checkpoint**: App khởi động được, `/health` xanh khi Redis up, env validate fail-fast.

---

## Phase 3: User Story 1 - Hội thoại streaming nhiều lượt (Priority: P1) 🎯 MVP

**Goal**: Seller gửi câu hỏi và nhận câu trả lời agent streaming qua SSE theo thời gian thực, nhiều lượt giữ ngữ cảnh.

**Independent Test**: Tạo phiên → `GET /conversations/:id/stream?message=...` thấy các `event: token` rồi `event: done`; hỏi nối tiếp giữ ngữ cảnh.

### Implementation for User Story 1

- [X] T014 [P] [US1] Tạo agent types `backend/src/agent/agent.types.ts` (AgentChunk: token|tool|error|done) theo data-model
- [X] T015 [P] [US1] Định nghĩa port `backend/src/agent/agent-runtime.port.ts` (`interface AgentRuntime { run(input, ctx): AsyncIterable<AgentChunk> }` + DI token)
- [X] T016 [US1] Tạo adapter `backend/src/agent/pi-agent-core.runtime.ts` bọc pi-agent-core (in-process), cấu hình LLM provider-agnostic từ config; map output → AgentChunk
- [X] T017 [P] [US1] Tạo `backend/src/agent/fake-agent.runtime.ts` (phát token giả + done) để test/dev khi chưa có key
- [X] T018 [US1] Tạo `backend/src/agent/agent.module.ts` provide AgentRuntime (chọn pi-agent-core hoặc fake theo env), export token
- [X] T019 [P] [US1] Tạo `backend/src/burgerprints/burgerprints.service.ts` + `burgerprints.module.ts`: axios client header `api-key`, base URL từ config, cache kết quả qua RedisService (TTL) (FR-006, R7)
- [X] T020 [US1] Tạo DTO `backend/src/conversation/dto/create-message.dto.ts` và `create-conversation.dto.ts` (class-validator)
- [X] T021 [US1] Tạo `backend/src/conversation/conversation.service.ts`: ghép SessionService + AgentRuntime, nạp lịch sử (MAX_CONTEXT_TURNS) làm ngữ cảnh, sinh `AsyncIterable<AgentChunk>`, lưu lượt user+assistant, phát hiện ngôn ngữ VN/EN (FR-003, FR-007)
- [X] T022 [US1] Tạo `backend/src/conversation/conversation.controller.ts`: `POST /conversations` (tạo phiên), `GET /conversations/:id/stream` dùng `@Sse()` map AgentChunk→MessageEvent, đóng luồng sạch khi done/error/disconnect (FR-002, FR-011, FR-013)
- [X] T023 [US1] Thêm fallback `POST /conversations/:id/messages` (gộp token, trả reply) trong conversation.controller.ts (R3)
- [X] T024 [US1] Gắn ConversationModule vào `app.module.ts`; xử lý 404 khi session không tồn tại trước khi mở stream
- [X] T025 [P] [US1] e2e test `backend/test/e2e/conversation.e2e-spec.ts` (supertest + FakeAgentRuntime): tạo phiên → stream nhận token...done; fallback trả reply

**Checkpoint**: US1 hoạt động độc lập — MVP streaming hội thoại chạy được với fake runtime.

---

## Phase 4: User Story 2 - Lưu & khôi phục trạng thái phiên (Priority: P2)

**Goal**: Trạng thái phiên bền vững, tách biệt giữa các phiên, TTL tự dọn.

**Independent Test**: Hai phiên không trộn lẫn; restart tiến trình lịch sử còn; phiên hết hạn bị dọn.

### Implementation for User Story 2

- [X] T026 [US2] Thêm refresh TTL mỗi lượt và cấu hình `SESSION_TTL_SECONDS` trong `backend/src/session/session.service.ts` (FR-014)
- [X] T027 [US2] Đảm bảo cô lập phiên bằng namespacing key `session:{id}` và `getTurns` chỉ trả lượt của phiên đó (FR-005); thêm guard `getSessionOrThrow` (404/expired)
- [X] T028 [P] [US2] e2e test `backend/test/e2e/session-isolation.e2e-spec.ts`: hai phiên độc lập không trộn lịch sử (SC-005)
- [X] T029 [P] [US2] unit test `backend/test/unit/session.service.spec.ts`: append/getTurns, TTL refresh, expired→cleanup (FR-014)

**Checkpoint**: US1 + US2 cùng hoạt động; persistence & isolation được xác minh.

---

## Phase 5: User Story 3 - Cài đặt nhanh & cấu hình an toàn (Priority: P2)

**Goal**: Clone → cấu hình env → một lệnh chạy → endpoint hoạt động trong ≤ 10 phút; không secret trong source.

**Independent Test**: Trên máy sạch theo README, `docker compose up` rồi gọi `/health` + 1 câu hỏi mẫu trong ≤ 10 phút; thiếu biến bắt buộc → app không khởi động + báo đúng biến.

### Implementation for User Story 3

- [X] T030 [P] [US3] Tạo `backend/Dockerfile` (multi-stage build NestJS, node:20)
- [X] T031 [US3] Tạo `backend/docker-compose.yml`: service `app` (build Dockerfile, env_file .env) + `redis:7`, mạng nội bộ, healthcheck (SC-001)
- [X] T032 [P] [US3] Hoàn thiện `backend/.env.example` đầy đủ biến + comment, KHÔNG giá trị secret thật (FR-008, SC-004)
- [X] T033 [US3] unit test `backend/test/unit/env.validation.spec.ts`: thiếu biến bắt buộc → schema báo lỗi nêu đích danh (SC-006)
- [X] T034 [US3] Viết `backend/README.md` theo quickstart.md: cài đặt ≤ 10 phút (Docker + local), bảng env, các lệnh curl mẫu (FR-015)

**Checkpoint**: Cài đặt ≤ 10 phút đạt; cấu hình an toàn được xác minh.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Hoàn thiện xuyên suốt.

- [X] T035 [P] Thêm xử lý edge case BurgerPrints API lỗi/timeout trong burgerprints.service.ts → trả lỗi có cấu trúc (agent không bịa)
- [X] T036 [P] Thêm structured logging cho vòng đời stream (mở/đóng/lỗi) phục vụ debug
- [X] T037 Chạy `backend/README.md` + quickstart.md validation end-to-end (acceptance checklist) và sửa nếu lệch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: không phụ thuộc — bắt đầu ngay
- **Foundational (P2)**: phụ thuộc Setup — BLOCKS mọi user story
- **US1 (P3)**: sau Foundational — không phụ thuộc story khác (MVP)
- **US2 (P4)**: sau Foundational — mở rộng SessionService (T010); test độc lập
- **US3 (P5)**: sau Foundational — đóng gói/cài đặt; độc lập US1/US2
- **Polish (P6)**: sau khi các story mong muốn xong

### Within Each User Story

- Types/port trước service; service trước controller/endpoint; core trước integration.

### Parallel Opportunities

- Setup: T003, T004 song song
- Foundational: T005, T006, T008, T009, T011, T013 song song (file khác nhau); T007 sau T005+T006; T010 sau T008+T009
- US1: T014, T015, T017, T019 song song; T016→T018; T021→T022→T023
- US2: T028, T029 song song sau T026/T027
- US3: T030, T032 song song; T031 sau T030

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 (dùng FakeAgentRuntime) → STOP & validate streaming → cắm pi-agent-core thật (T016) khi có key.

### Incremental Delivery

Foundational → US1 (MVP streaming) → US2 (persistence guarantees) → US3 (one-command install) → Polish.

---

## Notes

- [P] = file khác nhau, không phụ thuộc.
- Mỗi story độc lập completable/testable.
- pi-agent-core nằm sau port `AgentRuntime` (T015) — có FakeAgentRuntime (T017) để chạy/test khi chưa có key/LLM.
- Commit sau mỗi task hoặc nhóm logic.
