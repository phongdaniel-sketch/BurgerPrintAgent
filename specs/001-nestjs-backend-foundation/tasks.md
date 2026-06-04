# Tasks: Auth Module + MongoDB Persistence

**Input**: Design documents from `/specs/001-nestjs-backend-foundation/`

**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅)

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks grouped by user story. US1 (streaming), US2 (session persistence), US3 (setup/config) from original spec, plus new auth user stories derived from plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## User Story Mapping

| Story | Title | Priority | Scope |
|-------|-------|----------|-------|
| US1 | Hội thoại streaming nhiều lượt với agent | P1 | Existing — conversation + SSE |
| US2 | Lưu và khôi phục trạng thái phiên hội thoại | P2 | Existing (Redis) + NEW (MongoDB durable) |
| US3 | Cài đặt nhanh và cấu hình an toàn | P2 | Existing + MODIFY (MongoDB, JWT, OAuth env) |
| US4 | Xác thực seller (email/password + Google OAuth) | P1 | NEW — auth module |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, add MongoDB to infrastructure, extend config

- [x] T001 Install new npm dependencies: `@nestjs/mongoose mongoose @nestjs/passport passport passport-local passport-google-oauth20 @nestjs/jwt passport-jwt bcrypt` and devDependencies: `@types/passport-local @types/passport-google-oauth20 @types/bcrypt` in `backend/package.json`
- [x] T002 Add MongoDB service to `backend/docker-compose.yml` with image `mongo:7-jammy`, volume `mongo-data`, port `27017`, healthcheck
- [x] T003 [P] Add new env vars to `backend/.env.example`: `MONGODB_URI`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- [x] T004 [P] Extend env validation schema in `backend/src/config/env.validation.ts` — add Joi rules for `MONGODB_URI` (required URI), `JWT_SECRET` (required string), `JWT_ACCESS_EXPIRES_IN` (default `15m`), `JWT_REFRESH_EXPIRES_IN` (default `7d`), `GOOGLE_CLIENT_ID` (optional), `GOOGLE_CLIENT_SECRET` (optional), `GOOGLE_CALLBACK_URL` (optional URI)
- [x] T005 Extend typed config namespaces in `backend/src/config/configuration.ts` — add `MongoConfig`, `JwtConfig`, `OAuthConfig` interfaces and populate from `process.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database module + User schemas — MUST complete before auth or conversation MongoDB tasks

**⚠️ CRITICAL**: No auth/conversation MongoDB work can begin until this phase is complete

- [x] T006 Create database module `backend/src/database/database.module.ts` — `MongooseModule.forRootAsync` using `ConfigService` to read `mongo.uri`
- [x] T007 [P] Create User Mongoose schema `backend/src/users/schemas/user.schema.ts` with fields: email (unique), passwordHash, displayName, avatar, authProvider (enum local|google), providerId (sparse unique), role (enum user|admin), isActive, failedLoginAttempts, lockUntil, lastLoginAt; timestamps enabled; indexes per data-model.md
- [x] T008 [P] Create RefreshToken Mongoose schema `backend/src/users/schemas/refresh-token.schema.ts` with fields: token (unique), userId (ref User), expiresAt (TTL index), revokedAt, userAgent, ipAddress; timestamps enabled
- [x] T009 Create UsersModule `backend/src/users/users.module.ts` — register User and RefreshToken models, export UsersService
- [x] T010 Implement UsersService `backend/src/users/users.service.ts` — methods: `createLocal(email, passwordHash, displayName)`, `findByEmail(email)`, `findById(id)`, `findOrCreateOAuth(provider, providerId, email, displayName, avatar)`, `incrementFailedAttempts(userId)`, `resetFailedAttempts(userId)`, `isLocked(user)`, `updateLastLogin(userId)`
- [x] T011 Import DatabaseModule and UsersModule in `backend/src/app.module.ts`

**Checkpoint**: MongoDB connected, User + RefreshToken schemas registered, UsersService operational

---

## Phase 3: User Story 4 — Xác thực seller (Priority: P1) 🎯 MVP Auth

**Goal**: Seller có thể đăng ký, đăng nhập bằng email/password hoặc Google OAuth, nhận JWT access+refresh tokens để gọi API

**Independent Test**: Đăng ký tài khoản mới → đăng nhập → dùng access token gọi `/auth/me` → refresh token → logout

### Implementation for User Story 4

- [x] T012 [P] [US4] Create `@Public()` decorator in `backend/src/auth/decorators/public.decorator.ts` — SetMetadata decorator marking routes as public
- [x] T013 [P] [US4] Create `@CurrentUser()` param decorator in `backend/src/auth/decorators/current-user.decorator.ts` — extract user from request
- [x] T014 [P] [US4] Create auth constants in `backend/src/auth/auth.constants.ts` — IS_PUBLIC_KEY, MAX_FAILED_ATTEMPTS=5, LOCKOUT_DURATION_MS=900000, MAX_REFRESH_TOKENS_PER_USER=5
- [x] T015 [P] [US4] Create RegisterDto in `backend/src/auth/dto/register.dto.ts` — validate email (@IsEmail), password (min 8, uppercase+digit regex), displayName (optional, max 100)
- [x] T016 [P] [US4] Create LoginDto in `backend/src/auth/dto/login.dto.ts` — validate email, password
- [x] T017 [P] [US4] Create RefreshTokenDto in `backend/src/auth/dto/refresh-token.dto.ts` — validate refreshToken (IsUUID)
- [x] T018 [US4] Implement AuthService `backend/src/auth/auth.service.ts` — methods: `register(dto)` (hash password via bcrypt, create user, generate tokens), `login(email, password)` (validate credentials, check lockout per FR-016, reset/increment failed attempts, generate tokens), `refreshToken(token)` (validate, rotate, return new pair), `logout(refreshToken)` (revoke in MongoDB), `validateOAuthUser(profile)` (find-or-create user), `generateTokens(user)` (sign JWT access + create refresh in MongoDB with FIFO cleanup)
- [x] T019 [US4] Implement LocalStrategy `backend/src/auth/strategies/local.strategy.ts` — PassportStrategy(Strategy, 'local') calling AuthService.login
- [x] T020 [US4] Implement JwtStrategy `backend/src/auth/strategies/jwt.strategy.ts` — PassportStrategy(Strategy, 'jwt') extracting from Bearer header, validating sub + user existence
- [x] T021 [US4] Implement GoogleStrategy `backend/src/auth/strategies/google.strategy.ts` — PassportStrategy(Strategy, 'google') with clientID/Secret from config, scope ['email','profile'], calling AuthService.validateOAuthUser
- [x] T022 [US4] Create JwtAuthGuard `backend/src/auth/guards/jwt-auth.guard.ts` — extends AuthGuard('jwt'), checks @Public() metadata to skip auth for public routes
- [x] T023 [P] [US4] Create GoogleAuthGuard `backend/src/auth/guards/google-auth.guard.ts` — extends AuthGuard('google')
- [x] T024 [US4] Implement AuthController `backend/src/auth/auth.controller.ts` — endpoints: `POST /auth/register` (@Public), `POST /auth/login` (@Public), `POST /auth/refresh` (@Public), `POST /auth/logout`, `GET /auth/google` (@Public), `GET /auth/google/callback` (@Public), `GET /auth/me` — per contracts/auth-api.md
- [x] T025 [US4] Create AuthModule `backend/src/auth/auth.module.ts` — import PassportModule, JwtModule.registerAsync, UsersModule; register strategies; export AuthService
- [x] T026 [US4] Register AuthModule in `backend/src/app.module.ts` and apply JwtAuthGuard as APP_GUARD globally in `backend/src/main.ts` or via provider
- [x] T027 [US4] Mark existing public routes with `@Public()`: HealthController GET /health in `backend/src/health/health.controller.ts`

**Checkpoint**: Full auth flow operational — register, login, JWT protected routes, Google OAuth, account lockout, refresh token rotation

---

## Phase 4: User Story 2 — MongoDB Durable Persistence cho Conversation (Priority: P2)

**Goal**: Conversation history lưu dài hạn trong MongoDB (bổ sung Redis cache), gắn với userId sau auth

**Independent Test**: Tạo 2 phiên conversation (khác user), gửi messages, restart backend, verify history vẫn truy vấn được từ MongoDB

### Implementation for User Story 2

- [x] T028 [P] [US2] Create Conversation Mongoose schema `backend/src/conversation/schemas/conversation.schema.ts` — fields: sessionId (unique), userId (ref User, indexed), language, title, status (active|archived); timestamps; compound index {userId, updatedAt}
- [x] T029 [P] [US2] Create Message Mongoose schema `backend/src/conversation/schemas/message.schema.ts` — fields: conversationId (ref Conversation, indexed), role (user|assistant), content; timestamps; compound index {conversationId, createdAt}
- [x] T030 [US2] Register Conversation and Message models in `backend/src/conversation/conversation.module.ts` via MongooseModule.forFeature; import UsersModule if needed
- [x] T031 [US2] Modify ConversationService `backend/src/conversation/conversation.service.ts` — dual-write: on createConversation also create MongoDB Conversation doc with userId from JWT; on appendTurn also create MongoDB Message doc; add `getConversationHistory(userId, sessionId)` reading from MongoDB
- [x] T032 [US2] Modify ConversationController `backend/src/conversation/conversation.controller.ts` — inject @CurrentUser() to pass userId; add `GET /conversations` (list user's conversations with pagination); add `GET /conversations/:sessionId/history` (load messages from MongoDB); ensure all conversation endpoints require JWT auth (remove @Public if any)
- [x] T033 [US2] Update CreateConversationDto — add userId injection (from guard, not from body)

**Checkpoint**: Conversations persisted in MongoDB, linked to user, queryable after Redis TTL expires

---

## Phase 5: User Story 3 — Cài đặt nhanh và cấu hình an toàn (Priority: P2)

**Goal**: Cập nhật documentation và docker-compose cho flow cài đặt ≤ 10 phút bao gồm MongoDB + auth

**Independent Test**: Trên máy sạch, clone repo, cp .env.example .env, fill secrets, docker compose up → register → login → chat trong 10 phút

### Implementation for User Story 3

- [x] T034 [P] [US3] Update `backend/.env` and `backend/.env.example` with all new env vars (MONGODB_URI, JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL) with sensible defaults/placeholders
- [x] T035 [P] [US3] Add MongoDB health check indicator in `backend/src/health/health.module.ts` — check MongoDB connection status alongside Redis
- [x] T036 [US3] Update `backend/README.md` — add MongoDB setup instructions, auth endpoint documentation, new env vars, updated quickstart flow
- [x] T037 [US3] Update root `README.md` — reflect auth module addition and MongoDB dependency

**Checkpoint**: Complete setup flow works end-to-end in ≤ 10 minutes on a clean machine

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T038 [P] Update `backend/Dockerfile` to ensure MongoDB client libs are available if needed
- [x] T039 [P] Add request logging middleware for auth endpoints (login attempts, lockouts) in `backend/src/common/`
- [x] T040 Validate all env vars present and backend starts cleanly with `docker compose up`
- [x] T041 Run quickstart.md validation — full flow: register → login → create conversation → stream message → refresh token → logout
- [x] T042 Security review: verify no secrets in source code, .env in .gitignore, passwords hashed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US4 Auth (Phase 3)**: Depends on Foundational — can start after Phase 2
- **US2 MongoDB Persistence (Phase 4)**: Depends on Foundational + US4 (needs userId from auth)
- **US3 Config/Setup (Phase 5)**: Depends on US4 + US2 (documents final state)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US4 (Auth)**: Can start after Foundational (Phase 2) — No dependencies on US1/US2
- **US1 (Streaming)**: Already implemented — existing code, no changes needed
- **US2 (MongoDB Persistence)**: Depends on US4 (needs userId to link conversations)
- **US3 (Setup/Config)**: Depends on US4 + US2 (must document final state)

### Within Each User Story

- Schemas/Models before services
- Services before controllers/endpoints
- DTOs and decorators (parallel) before services that use them
- Module registration after all components created

### Parallel Opportunities

- T003, T004, T005 can run in parallel (different files)
- T007, T008 can run in parallel (different schema files)
- T012, T013, T014, T015, T016, T017 can run in parallel (independent files)
- T028, T029 can run in parallel (different schema files)
- T034, T035 can run in parallel (different files)
- T038, T039 can run in parallel (different concerns)

---

## Parallel Example: User Story 4 (Auth)

```bash
# Launch all DTOs + decorators + constants in parallel:
Task: "T012 Create @Public() decorator in backend/src/auth/decorators/public.decorator.ts"
Task: "T013 Create @CurrentUser() decorator in backend/src/auth/decorators/current-user.decorator.ts"
Task: "T014 Create auth constants in backend/src/auth/auth.constants.ts"
Task: "T015 Create RegisterDto in backend/src/auth/dto/register.dto.ts"
Task: "T016 Create LoginDto in backend/src/auth/dto/login.dto.ts"
Task: "T017 Create RefreshTokenDto in backend/src/auth/dto/refresh-token.dto.ts"

# Then sequentially:
Task: "T018 Implement AuthService"
Task: "T019-T021 Implement strategies"
Task: "T022-T023 Create guards"
Task: "T024 Implement AuthController"
Task: "T025-T027 Module registration + global guard"
```

---

## Implementation Strategy

### MVP First (Auth + Existing Streaming)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (MongoDB + User schemas)
3. Complete Phase 3: US4 (Auth) — register, login, JWT, OAuth
4. **STOP and VALIDATE**: Test auth flow end-to-end
5. At this point: seller can register, login, and chat via existing streaming endpoints (now protected by JWT)

### Incremental Delivery

1. Setup + Foundational → MongoDB connected, schemas ready
2. Add US4 (Auth) → Test independently → Auth MVP ✅
3. Add US2 (MongoDB Persistence) → Test independently → Durable conversations ✅
4. Add US3 (Config/Setup) → Validate quickstart → Full stack documented ✅
5. Polish → Security, logging, cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 (Streaming) is already fully implemented in existing codebase — no new tasks needed
- US4 (Auth) is the new MVP story — highest priority
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
