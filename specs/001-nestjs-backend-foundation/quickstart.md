# Quickstart: Auth Module + MongoDB

## Prerequisites

- Node.js ≥ 18
- Docker & Docker Compose (cho Redis + MongoDB)
- Google Cloud Console project (cho OAuth — optional)

## 1. Start Infrastructure

```bash
cd backend
docker compose up -d
```

> Bây giờ docker-compose sẽ khởi chạy cả **Redis** (port 6379) và **MongoDB** (port 27017).

## 2. Configure Environment

```bash
cp .env.example .env
```

Bổ sung/cập nhật các biến mới trong `.env`:

```env
# ─── MongoDB ───────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/burgerprints-agent

# ─── JWT ───────────────────────────────────────────────
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── OAuth (optional — bỏ qua nếu chưa cần Google login) ─
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

## 3. Install & Run

```bash
npm install
npm run start:dev
```

## 4. Test Auth Flow

### Register
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","displayName":"Test User"}'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'
```

### Use Access Token
```bash
# Lấy accessToken từ response login
export TOKEN="eyJhbG..."

# Tạo conversation (giờ cần auth)
curl -X POST http://localhost:3000/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"vi"}'

# Lấy profile
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"uuid-from-login-response"}'
```

## 5. Google OAuth (Optional)

1. Tạo project trong [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API
3. Tạo OAuth 2.0 Client ID (Web application)
4. Set Authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID + Secret vào `.env`
6. Mở browser: `http://localhost:3000/auth/google`

## Health Check

```bash
curl http://localhost:3000/health
```

> Response sẽ bao gồm trạng thái MongoDB connection.
