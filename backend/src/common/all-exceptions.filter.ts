import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Chuẩn hóa lỗi HTTP có cấu trúc (FR-011). Lưu ý: lỗi xảy ra GIỮA luồng SSE
 * được xử lý trong ConversationService bằng cách phát `error` event rồi complete,
 * KHÔNG đi qua filter này (response đã ở chế độ stream).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Nếu response đang streaming (SSE) thì không ghi đè được nữa.
    if (response.headersSent) {
      this.logger.error(
        `Lỗi sau khi headers đã gửi (có thể trong stream): ${String(exception)}`,
      );
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const body =
      typeof payload === 'string'
        ? { message: payload }
        : (payload as Record<string, unknown>);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...body,
    });
  }
}
