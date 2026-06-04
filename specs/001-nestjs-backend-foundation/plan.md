# Implementation Plan: Auth Module + MongoDB Persistence

**Branch**: `main` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-nestjs-backend-foundation/spec.md` + yêu cầu bổ sung: "Bổ sung module auth: auth email, password, oauth + triển khai database mongodb lưu user, lưu conversation, session"

## Summary

Bổ sung module authentication (email/password + Google OAuth) vào backend NestJS hiện có, đồng thời thêm MongoDB (Mongoose) làm persistent storage cho User, Conversation history, và Session management. Redis giữ nguyên vai trò hot cache cho real-time agent context. JWT (Access + Refresh Token) cho stateless auth phù hợp kiến trúc SSE streaming.

## Technical Context

**Language/Version**: TypeScript 5.7+ / Node.js 18+

**Primary Dependencies**:
- NestJS 10.x (existing)
- `@nestjs/mongoose` + `mongoose` (NEW — MongoDB ODM)
- `@nestjs/passport` + `passport` + `passport-local` + `passport-google-oauth20` (NEW — auth strategies)
- `@nestjs/jwt` + `passport-jwt` (NEW — JWT token)
- `bcrypt` (NEW — password hashing)

**Storage**: Redis (existing — session cache) + MongoDB 7.x (NEW — durable persistence)

**Testing**: Jest (existing)

**Target Platform**: Linux server (Docker)

**Project Type**: Web service (NestJS backend API)

**Constraints**: Giữ backward compatibility với session flow hiện tại; cài đặt ≤ 10 phút

## Constitution Check

*GATE: Constitution chưa được cấu hình (template mặc định). Tiến hành.*

## Project Structure

### Documentation (this feature)

```text
specs/001-nestjs-backend-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── auth-api.md      # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── auth/                          # [NEW] Auth module
│   │   ├── auth.module.ts             # Module definition
│   │   ├── auth.controller.ts         # Auth endpoints
│   │   ├── auth.service.ts            # Auth business logic
│   │   ├── dto/
│   │   │   ├── register.dto.ts        # Register validation
│   │   │   ├── login.dto.ts           # Login validation
│   │   │   └── refresh-token.dto.ts   # Refresh token validation
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts      # Global JWT guard
│   │   │   └── google-auth.guard.ts   # Google OAuth guard
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts        # JWT validation strategy
│   │   │   ├── local.strategy.ts      # Email/password strategy
│   │   │   └── google.strategy.ts     # Google OAuth strategy
│   │   ├── decorators/
│   │   │   ├── public.decorator.ts    # @Public() route decorator
│   │   │   └── current-user.decorator.ts  # @CurrentUser() param decorator
│   │   └── auth.constants.ts          # Auth-related constants
│   │
│   ├── users/                         # [NEW] Users module
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   └── schemas/
│   │       ├── user.schema.ts         # Mongoose User schema
│   │       └── refresh-token.schema.ts # Mongoose RefreshToken schema
│   │
│   ├── database/                      # [NEW] Database module
│   │   └── database.module.ts         # MongooseModule.forRootAsync config
│   │
│   ├── conversation/                  # [MODIFY] Add MongoDB persistence
│   │   ├── conversation.controller.ts # Add auth guard, userId
│   │   ├── conversation.module.ts     # Import Mongoose schemas
│   │   ├── conversation.service.ts    # Dual-write Redis + MongoDB
│   │   └── schemas/
│   │       ├── conversation.schema.ts # [NEW] Mongoose Conversation schema
│   │       └── message.schema.ts      # [NEW] Mongoose Message schema
│   │
│   ├── config/
│   │   ├── configuration.ts           # [MODIFY] Add mongo, jwt, oauth config
│   │   └── env.validation.ts          # [MODIFY] Add new env vars
│   │
│   ├── health/
│   │   └── health.module.ts           # [MODIFY] Add MongoDB health indicator
│   │
│   ├── app.module.ts                  # [MODIFY] Import new modules
│   └── main.ts                        # [MODIFY] Apply global JWT guard
│
├── docker-compose.yml                 # [MODIFY] Add MongoDB service
├── .env.example                       # [MODIFY] Add new env vars
└── package.json                       # [MODIFY] Add new dependencies
```

**Structure Decision**: Giữ nguyên layout `backend/src/` hiện tại, thêm 3 modules mới (`auth/`, `users/`, `database/`) theo NestJS modular convention. Conversation module mở rộng với MongoDB schemas.

## Complexity Tracking

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Dual-store (Redis + MongoDB) | Cần thiết | Redis cho real-time (agent context), MongoDB cho persistence (history, user) |
| Refresh Token rotation | Cần thiết | Security best practice; không thêm complexity đáng kể |
| Global JWT guard | Đơn giản hóa | Default-secure, `@Public()` cho exceptions → ít boilerplate |
