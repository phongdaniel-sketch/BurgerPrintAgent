# Research: Auth Module + MongoDB Persistence

**Feature**: 001-nestjs-backend-foundation (bổ sung auth module)
**Date**: 2026-06-04

## R1: MongoDB Integration Strategy

### Decision: Mongoose ODM via `@nestjs/mongoose`

### Rationale
- `@nestjs/mongoose` là package chính thức của NestJS, tích hợp sâu với DI container (module import, model injection).
- Mongoose cung cấp schema validation, middleware (pre/post hooks), và TypeScript type-safety qua `@Schema()` + `SchemaFactory`.
- Project đã dùng NestJS patterns (modules, services, DI) → Mongoose ODM phù hợp tự nhiên.
- Redis vẫn giữ vai trò cache session/conversation state ngắn hạn (TTL). MongoDB đảm nhận persistent storage (user, conversation history dài hạn).

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| TypeORM + MongoDB driver | TypeORM MongoDB support thử nghiệm, ít community support |
| Prisma + MongoDB | Prisma MongoDB adapter chưa mature bằng Mongoose, thiếu middleware hooks |
| Native MongoDB driver | Quá thấp cấp, không có schema validation built-in, boilerplate nhiều |

---

## R2: Authentication Strategy (Email/Password + OAuth)

### Decision: Passport.js + JWT (Access + Refresh Token)

### Rationale
- `@nestjs/passport` là standard chính thức cho NestJS authentication, battle-tested.
- Hỗ trợ nhiều strategy qua plugin: `passport-local` (email/password), `passport-google-oauth20`, `passport-jwt`.
- JWT stateless → phù hợp kiến trúc hiện tại (SSE streaming, không cần server-side session cho auth).
- Access Token (ngắn hạn, 15m) + Refresh Token (dài hạn, 7d, lưu MongoDB) → cân bằng bảo mật và UX.

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| Session-based auth (express-session) | Stateful, conflict với SSE streaming architecture |
| Better Auth / Lucia | Mới, ít documentation cho NestJS ecosystem |
| Firebase Auth | External dependency, không cần thiết cho self-hosted backend |

---

## R3: Password Hashing

### Decision: bcrypt (10 salt rounds)

### Rationale
- Industry standard, chậm-có-chủ-đích để chống brute force.
- `bcrypt` npm package ổn định, hỗ trợ async hash/compare.
- 10 salt rounds cho balance giữa security và performance (~100ms/hash).

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| argon2 | Performance tốt hơn nhưng cần native binary, phức tạp hóa Docker build |
| scrypt | Ít tooling support trong NestJS ecosystem |

---

## R4: OAuth Provider

### Decision: Google OAuth2 (passport-google-oauth20), mở rộng được cho GitHub/Facebook sau

### Rationale
- Google OAuth phổ biến nhất cho audience seller POD (đa số dùng Google account).
- `passport-google-oauth20` mature, docs rõ ràng.
- Schema User thiết kế provider-agnostic: field `authProvider` + `providerId` → dễ thêm provider mới.

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| GitHub OAuth | Phụ cho audience seller, có thể thêm sau |
| Apple Sign In | Cần Apple Developer Account, phức tạp |

---

## R5: Conversation/Session Persistence Strategy (MongoDB vs Redis)

### Decision: Dual-store — Redis (hot cache, TTL) + MongoDB (durable persistence)

### Rationale
- Redis giữ nguyên vai trò hiện tại: session state ngắn hạn, TTL auto-expire, fast read cho agent context.
- MongoDB bổ sung: lưu conversation history dài hạn (gắn userId), lưu user profiles.
- Khi session Redis expire → conversation history vẫn truy vấn được từ MongoDB (user xem lại lịch sử).
- Flow: Conversation turns ghi cả Redis (real-time) lẫn MongoDB (durable). Session metadata chỉ Redis.

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| Chỉ MongoDB | Latency cao cho real-time agent context reads |
| Chỉ Redis | Mất dữ liệu khi TTL expire hoặc Redis restart |

---

## R6: JWT Token Structure

### Decision: Access Token (header) + Refresh Token (httpOnly cookie hoặc body)

### Details
- **Access Token**: JWT signed, payload `{ sub: userId, email, role }`, expires 15 phút.
- **Refresh Token**: UUID random, lưu MongoDB (RefreshToken collection), expires 7 ngày.
- **Refresh flow**: Client gửi refresh token → server validate + rotate → trả access token mới.
- **Revocation**: Xóa refresh token từ MongoDB = logout/invalidate.

---

## R7: Guard Architecture

### Decision: Global JwtAuthGuard + `@Public()` decorator cho routes công khai

### Rationale
- Default secure: mọi route cần JWT trừ khi đánh dấu `@Public()`.
- Routes công khai: `POST /auth/register`, `POST /auth/login`, `GET /auth/google`, `GET /auth/google/callback`, `GET /health`.
- Conversation endpoints (`/conversations/*`) yêu cầu JWT → conversation gắn với userId.

---

## R8: Docker Compose Update

### Decision: Thêm MongoDB service vào docker-compose.yml hiện tại

### Details
- Image: `mongo:7-jammy` (LTS)
- Volume: `mongo-data` để persist
- Port: `27017:27017`
- Healthcheck: `mongosh --eval "db.adminCommand('ping')"`

---

## R9: Swagger API Documentation

### Decision: Custom Decorators wrapping `@nestjs/swagger` & `class-validator`

### Rationale
- Tự động sinh API docs và thực hiện validation đồng thời thông qua các custom decorators (`@StringField`, `@ApiAuth`, `@ApiPublic`).
- Giảm thiểu boilerplate code trong Controller và DTO (không cần khai báo rời rạc `@ApiProperty` và `@IsString`).
- Tập trung logic phân quyền, authentication, và response type vào các decorator chuẩn hóa như `@ApiAuth` hay `@ApiPublic`.
- Cung cấp giao diện Swagger UI trực quan để test API ngay trên trình duyệt.

### Alternatives Considered
| Alternative | Rejected Because |
|---|---|
| Raw `@nestjs/swagger` decorators | Trùng lặp code nhiều khi phải khai báo cả `@ApiProperty` và class-validator |
| Postman Collection | Phải cập nhật thủ công, dễ bị out-of-sync với code |
