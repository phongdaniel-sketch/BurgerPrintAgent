# API Contracts: Auth Module

**Feature**: 001-nestjs-backend-foundation (bổ sung auth module)
**Date**: 2026-06-04
**Base URL**: `http://localhost:3000`

---

## Auth Endpoints

### POST /auth/register

Đăng ký tài khoản mới bằng email/password.

**Access**: Public (`@Public()`)

**Request Body**:
```json
{
  "email": "seller@example.com",
  "password": "MyStr0ngP@ss",
  "displayName": "Nguyễn Văn A"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `email` | string | ✅ | Valid email format, max 255 chars |
| `password` | string | ✅ | Min 8 chars, ≥1 uppercase, ≥1 digit |
| `displayName` | string | ❌ | Max 100 chars |

**Response 201**:
```json
{
  "user": {
    "id": "665f...",
    "email": "seller@example.com",
    "displayName": "Nguyễn Văn A",
    "role": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4-e5f6-..."
}
```

**Error Responses**:
| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input không hợp lệ |
| 409 | `EMAIL_EXISTS` | Email đã được đăng ký |

---

### POST /auth/login

Đăng nhập bằng email/password.

**Access**: Public (`@Public()`)

**Request Body**:
```json
{
  "email": "seller@example.com",
  "password": "MyStr0ngP@ss"
}
```

**Response 200**:
```json
{
  "user": {
    "id": "665f...",
    "email": "seller@example.com",
    "displayName": "Nguyễn Văn A",
    "role": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4-e5f6-..."
}
```

**Error Responses**:
| Status | Code | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Email/password không đúng |
| 403 | `ACCOUNT_DISABLED` | Tài khoản đã bị disable |

---

### POST /auth/refresh

Làm mới access token bằng refresh token.

**Access**: Public (`@Public()`)

**Request Body**:
```json
{
  "refreshToken": "a1b2c3d4-e5f6-..."
}
```

**Response 200**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "new-uuid-..."
}
```

> ⚠️ Refresh token rotation: token cũ bị revoke, trả token mới.

**Error Responses**:
| Status | Code | When |
|---|---|---|
| 401 | `INVALID_REFRESH_TOKEN` | Token không tồn tại, đã hết hạn, hoặc đã bị revoke |

---

### POST /auth/logout

Đăng xuất — revoke refresh token.

**Access**: Authenticated (JWT)

**Request Body**:
```json
{
  "refreshToken": "a1b2c3d4-e5f6-..."
}
```

**Response 200**:
```json
{
  "message": "Logged out successfully"
}
```

---

### GET /auth/google

Redirect đến Google OAuth consent screen.

**Access**: Public (`@Public()`)

**Response**: 302 Redirect → Google OAuth URL

---

### GET /auth/google/callback

Google OAuth callback — xử lý code, tạo/liên kết user, trả tokens.

**Access**: Public (`@Public()`)

**Query Params** (từ Google):
| Param | Type | Description |
|---|---|---|
| `code` | string | Authorization code từ Google |
| `state` | string | CSRF state token |

**Response**: 302 Redirect → Frontend URL với tokens:
```
{FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...
```

> Hoặc trả JSON nếu `Accept: application/json`.

---

### GET /auth/me

Lấy thông tin user hiện tại từ JWT.

**Access**: Authenticated (JWT)

**Response 200**:
```json
{
  "id": "665f...",
  "email": "seller@example.com",
  "displayName": "Nguyễn Văn A",
  "avatar": "https://...",
  "role": "user",
  "authProvider": "local",
  "createdAt": "2026-06-04T10:00:00Z"
}
```

---

## Conversation Endpoints (Updated — require auth)

### POST /conversations

**Access**: Authenticated (JWT) ← **CHANGED** (trước đây public)

**Request Body**: (giữ nguyên)
```json
{
  "language": "vi"
}
```

**Response 201**: (thêm `userId`)
```json
{
  "sessionId": "uuid-...",
  "userId": "665f..."
}
```

> Conversation được gắn với `userId` từ JWT.

---

### GET /conversations

**Access**: Authenticated (JWT) ← **NEW**

Lấy danh sách conversations của user hiện tại.

**Query Params**:
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Trang |
| `limit` | number | 20 | Số item/trang (max 100) |
| `status` | string | `active` | `active` \| `archived` \| `all` |

**Response 200**:
```json
{
  "data": [
    {
      "id": "665f...",
      "sessionId": "uuid-...",
      "title": "T-shirt cho thị trường Mỹ",
      "language": "vi",
      "status": "active",
      "updatedAt": "2026-06-04T15:00:00Z",
      "messageCount": 8
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### GET /conversations/:sessionId/history

**Access**: Authenticated (JWT) ← **NEW**

Lấy toàn bộ message history từ MongoDB (không bị Redis TTL expire).

**Response 200**:
```json
{
  "sessionId": "uuid-...",
  "messages": [
    {
      "role": "user",
      "content": "Tôi muốn bán T-shirt...",
      "createdAt": "2026-06-04T14:30:00Z"
    },
    {
      "role": "assistant",
      "content": "Dựa trên dữ liệu...",
      "createdAt": "2026-06-04T14:30:05Z"
    }
  ]
}
```

---

## JWT Token Format

### Access Token Payload
```json
{
  "sub": "665f...",
  "email": "seller@example.com",
  "role": "user",
  "iat": 1717500000,
  "exp": 1717500900
}
```

### Authorization Header
```
Authorization: Bearer <accessToken>
```

---

## Error Response Format (Standard)

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "code": "INVALID_CREDENTIALS",
  "message": "Email hoặc mật khẩu không đúng",
  "timestamp": "2026-06-04T15:00:00Z"
}
```
