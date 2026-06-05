# Swagger API Contract

**Feature**: 001-nestjs-backend-foundation (Bổ sung swagger docs)
**Date**: 2026-06-05

## Overview
Hệ thống sử dụng Swagger để document các REST APIs. Thay vì dùng trực tiếp các decorators của `@nestjs/swagger`, chúng ta sử dụng các **custom decorators** được định nghĩa sẵn trong `src/common/decorators` để gom chung logic validation, auth, và swagger documentation.

## Base Configuration
- **Path**: `/api/docs`
- **Title**: BurgerPrints Agent API
- **Description**: API documentation cho backend của AI chatbot agent BurgerPrints
- **Version**: 1.0

## Authentication in Swagger
Các endpoint được bảo vệ sẽ sử dụng decorator `@ApiAuth()`. Swagger UI tự động nhận diện scheme `Bearer JWT`. Developer/User có thể nhập token vào nút "Authorize" trên giao diện để gọi API.

## Example Custom Decorator Usage

### Controller (`http.decorators.ts`)
Sử dụng `@ApiPublic()` cho route không cần auth, và `@ApiAuth()` cho route cần auth.

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { ApiPublic, ApiAuth } from '@common/decorators/http.decorators';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  
  @Post('login')
  @ApiPublic({
    type: LoginResponseDto,
    summary: 'Login user with email and password',
  })
  async login(@Body() loginDto: LoginDto) { ... }

  @Post('profile')
  @ApiAuth({
    type: UserProfileDto,
    summary: 'Get current user profile',
  })
  async getProfile() { ... }
}
```

### DTO (`field.decorators.ts`)
Sử dụng các decorator có sẵn như `@EmailField()`, `@PasswordField()`, `@StringField()` để gom `@ApiProperty` và class-validator.

```typescript
import { EmailField, PasswordField } from '@common/decorators/field.decorators';

export class LoginDto {
  @EmailField({ description: 'User email address', example: 'user@example.com' })
  email: string;

  @PasswordField({ description: 'User password', example: 'Password123!' })
  password: string;
}
```
