# Phase 0 Research: NestJS Backend Foundation

**Feature**: 001-nestjs-backend-foundation | **Date**: 2026-06-04

Tổng hợp quyết định kỹ thuật. Mỗi mục: Decision / Rationale / Alternatives considered.

## R1. Tích hợp pi-agent-core

- **Decision**: Tích hợp pi-agent-core như **thư viện in-process TS/JS**, bọc sau một port `AgentRuntime` (`run(input): AsyncIterable<AgentChunk>`). NestJS `ConversationService` chỉ phụ thuộc vào port, không phụ thuộc trực tiếp package.
- **Package thật**: `@earendil-works/pi-agent-core` (+ `@earendil-works/pi-ai`), thuộc bộ "Pi" toolkit của earendil-works (Mario Zechner/badlogic). ⚠️ Bare `pi-agent-core` trên npm chỉ là placeholder reservation — package thật là **scoped**. Cả hai là **ESM-only**.
- **API thật**: `new Agent({ initialState: { systemPrompt, model: getModel(provider, modelId), tools, messages } })`; **push-based** — `agent.subscribe(event => …)` + `await agent.prompt(text)`. Token stream qua `event.type==='message_update' && event.assistantMessageEvent.type==='text_delta'` (`.delta`); tool qua `tool_execution_start/end`; kết thúc `agent_end`. Adapter bắc cầu **push → pull** vào `AsyncIterable<AgentChunk>` của port.
- **Rationale**: Port giúp (1) cô lập API push-based của pi sau interface pull-based gọn cho SSE, (2) test SSE/conversation bằng `FakeAgentRuntime` không cần LLM thật, (3) thay runtime sau này không phá controller. **Đã verify thật**: OpenAI gpt-4o stream 37 token + tự gọi tool `burgerprints_search` + giữ ngữ cảnh multi-turn.
- **ESM từ CommonJS**: dùng `new Function('m','return import(m)')` để giữ `import()` thật ở runtime (tránh tsc module=commonjs hạ cấp thành require làm vỡ ESM-only).
- **Alternatives considered**: Gọi package trực tiếp trong controller (loại: khó test, rò rỉ phụ thuộc, lệch push/pull); chạy pi-agent-core thành service riêng qua HTTP (loại: người dùng chọn in-process, tránh thêm hạ tầng).

## R2. Streaming qua SSE trong NestJS

- **Decision**: Dùng SSE. Phát luồng bằng cách trả `Observable<MessageEvent>` từ controller method gắn `@Sse()` (cơ chế SSE built-in của `@nestjs/common`). Mỗi `AgentChunk` map sang một `MessageEvent` với `event` type: `token` | `tool` | `error` | `done`.
- **Rationale**: SSE built-in của NestJS xử lý đúng `Content-Type: text/event-stream`, keep-alive, và tự đóng khi observable complete. Bắc cầu `AsyncIterable` (từ runtime) sang `Observable` để tận dụng teardown khi client disconnect (FR-013).
- **Alternatives considered**: WebSocket (loại: spec yêu cầu SSE, SSE đơn giản hơn cho one-way streaming, hợp web client); tự set header + `res.write` thủ công (loại: bỏ qua tiện ích lifecycle của Nest, dễ leak).
- **Lưu ý lỗi**: Lỗi runtime/datasource KHÔNG ném ra ngoài observable (tránh đứt SSE thô) mà emit một `MessageEvent{event:'error'}` rồi `complete()` → client nhận tín hiệu lỗi có cấu trúc (FR-011, SC-007).

## R3. Endpoint shape cho hội thoại

- **Decision**: 2 endpoint:
  - `POST /conversations` → tạo phiên, trả `{ sessionId }`.
  - `GET /conversations/:sessionId/stream?message=...` (SSE) → gửi 1 message và stream câu trả lời.
  Thêm fallback non-stream `POST /conversations/:sessionId/messages` trả nguyên câu trả lời (tiện test/curl).
- **Rationale**: `@Sse()` của Nest dùng GET; truyền message qua query để client SSE (EventSource) gọi được trực tiếp. POST tạo phiên tách biệt giúp quản lý vòng đời session rõ ràng.
- **Alternatives considered**: Một POST vừa tạo vừa stream (loại: EventSource chuẩn không gửi được POST body; giữ GET cho SSE đơn giản hơn cho giám khảo test bằng trình duyệt/curl).

## R4. Lưu trạng thái phiên trên Redis

- **Decision**: `ioredis`. Mỗi phiên lưu metadata ở hash `session:{id}` và lịch sử lượt ở list `session:{id}:turns` (mỗi phần tử là JSON `{role, content, ts}`). Áp `EXPIRE` TTL (mặc định `SESSION_TTL_SECONDS`, vd 3600) refresh mỗi lượt → tự dọn phiên hết hạn (FR-014).
- **Rationale**: Hash + list là cấu trúc Redis tự nhiên cho metadata + append-only history; TTL refresh theo hoạt động đáp ứng FR-014 mà không cần job dọn riêng. `ioredis` ổn định, hỗ trợ pipeline.
- **Alternatives considered**: Lưu cả phiên thành 1 JSON string (loại: phải đọc-sửa-ghi toàn bộ mỗi lượt); `@nestjs/cache-manager` (loại: trừu tượng hóa che mất TTL/cấu trúc cần kiểm soát).

## R5. Cấu hình & validation (không hardcode secret)

- **Decision**: `@nestjs/config` ở chế độ global + schema **joi** validate khi bootstrap; fail-fast nếu thiếu biến bắt buộc (FR-009, SC-006). Cung cấp `configuration.ts` trả về các namespace có kiểu (`app`, `redis`, `llm`, `burgerprints`). `.env.example` liệt kê mọi biến nhưng để giá trị rỗng/placeholder.
- **Rationale**: joi schema cho thông báo lỗi nêu đích danh biến thiếu. Namespaced config tránh đọc `process.env` rải rác (chống hardcode).
- **Alternatives considered**: `class-validator` cho env (loại: joi gọn hơn cho env phẳng); đọc `process.env` trực tiếp (loại: không validate, dễ lỗi runtime mơ hồ).
- **Env bắt buộc (dự kiến)**: `PORT`, `REDIS_URL`, `SESSION_TTL_SECONDS`, `BURGERPRINTS_API_BASE_URL`, `BURGERPRINTS_API_KEY`, `LLM_PROVIDER` (`anthropic|openai`), và key tương ứng `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (conditional theo provider).

## R6. LLM provider-agnostic

- **Decision**: Chọn provider qua `LLM_PROVIDER`; nạp key tương ứng. Cấu hình truyền vào pi-agent-core adapter; model cụ thể chốt ở bước implement. Joi validate điều kiện: key của provider được chọn là bắt buộc.
- **Rationale**: Người dùng chọn "linh hoạt qua env". Đề bài cho tự chọn LLM; không khóa cứng vendor ở foundation.
- **Alternatives considered**: Khóa cứng 1 provider (loại: trái yêu cầu); abstraction layer LLM riêng (loại: pi-agent-core đã là runtime, không nhân đôi).

## R7. Tích hợp BurgerPrints API v2.0 + cache

- **Decision**: `BurgerPrintsService` dùng `axios` với header `api-key` (theo memory về API v2), base URL từ env. Cache kết quả tra cứu catalog vào Redis với TTL ngắn (`CATALOG_CACHE_TTL_SECONDS`) để giảm gọi lặp trong một phiên.
- **Rationale**: Đề bài bắt buộc dùng API v2.0 (không cào, không hardcode dữ liệu — FR-006). Cache giảm độ trễ và rate-limit. Khi API lỗi → trả lỗi có cấu trúc để agent không bịa (edge case).
- **Alternatives considered**: Không cache (loại: chậm, dễ rate-limit khi agent gọi nhiều lần/lượt); cache in-memory (loại: mất khi restart, không chia sẻ giữa instance — Redis nhất quán với FR-005).

## R8. Health check & cài đặt ≤ 10 phút

- **Decision**: `@nestjs/terminus` cho `GET /health` (ping Redis). `docker-compose.yml` gồm 2 service: `app` (build từ Dockerfile) + `redis:7`. README: `cp .env.example .env` → điền key → `docker compose up` → gọi health + 1 câu hỏi mẫu.
- **Rationale**: Compose đóng gói Redis cùng app → một lệnh chạy, đạt SC-001 (≤ 10 phút). Terminus chuẩn hóa readiness (FR-010).
- **Alternatives considered**: Yêu cầu cài Redis thủ công (loại: tăng thời gian/độ ma sát cài đặt); health tự viết (loại: terminus có sẵn pattern).

## Tổng hợp: tất cả NEEDS CLARIFICATION đã giải quyết

| Unknown | Trạng thái |
|---------|-----------|
| Hình thức tích hợp pi-agent-core | Resolved (R1: in-process + port) |
| LLM provider | Resolved (R6: agnostic qua env) |
| Cơ chế streaming | Resolved (R2: NestJS `@Sse()`) |
| Mô hình lưu phiên | Resolved (R4: Redis hash+list+TTL) |
