import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';

interface IApiOptions {
  summary?: string;
  description?: string;
}

export function ApiPublic(options: IApiOptions = {}): MethodDecorator {
  return applyDecorators(
    Public(),
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    HttpCode(HttpStatus.OK),
    ApiResponse({ status: 200, description: 'OK' }),
    ApiResponse({ status: 400, description: 'Bad Request' }),
    ApiResponse({ status: 500, description: 'Internal Server Error' }),
  );
}

export function ApiAuth(options: IApiOptions = {}): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    HttpCode(HttpStatus.OK),
    ApiResponse({ status: 200, description: 'OK' }),
    ApiResponse({ status: 400, description: 'Bad Request' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 500, description: 'Internal Server Error' }),
  );
}
