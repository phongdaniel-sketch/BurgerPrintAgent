import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Sse,
  Req,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentChunk } from '../agent/agent.types';
import { defaultSystemPrompt } from '../agent/pi-agent-core.runtime';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationService } from './conversation.service';
import { ApiAuth } from '../common/decorators/http.decorators';

/** SSE MessageEvent shape của NestJS. `type` → tên event SSE. */
interface SseMessageEvent {
  data: Record<string, unknown>;
  type: string;
}

@Controller('conversations')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly conversation: ConversationService) {}

  /** Tạo phiên mới. */
  @ApiAuth({ summary: 'Create new conversation' })
  @Post()
  async create(
    @Body() dto: CreateConversationDto,
    @Req() req: any,
  ): Promise<{ sessionId: string }> {
    const session = await this.conversation.createConversation(
      req.user._id,
      dto.language ?? null,
    );
    return { sessionId: session.id };
  }

  /** Lấy system prompt hiện tại của phiên + bản mặc định (để FE chỉnh). */
  @ApiAuth({ summary: 'Get conversation system prompt' })
  @Get(':sessionId/system-prompt')
  async getSystemPrompt(
    @Param('sessionId') sessionId: string,
  ): Promise<{ systemPrompt: string | null; default: string }> {
    const custom = await this.conversation.getSystemPrompt(sessionId);
    return { systemPrompt: custom, default: defaultSystemPrompt() };
  }

  /** Đặt/đổi system prompt cho phiên (rỗng = reset về mặc định). */
  @ApiAuth({ summary: 'Set conversation system prompt' })
  @Put(':sessionId/system-prompt')
  async setSystemPrompt(
    @Param('sessionId') sessionId: string,
    @Body() body: { systemPrompt?: string },
  ): Promise<{ ok: boolean; usingDefault: boolean }> {
    await this.conversation.setSystemPrompt(sessionId, body?.systemPrompt ?? null);
    const usingDefault = !(body?.systemPrompt && body.systemPrompt.trim());
    return { ok: true, usingDefault };
  }

  /**
   * Hội thoại streaming qua SSE (FR-002). EventSource dùng GET, message qua query.
   * Map AgentChunk → MessageEvent; đóng luồng sạch khi done/error/disconnect (FR-011, FR-013).
   */
  @ApiAuth({ summary: 'Stream conversation messages via SSE' })
  @Sse(':sessionId/stream')
  stream(
    @Param('sessionId') sessionId: string,
    @Query('message') message: string,
  ): Observable<SseMessageEvent> {
    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Query param "message" là bắt buộc');
    }

    return new Observable<SseMessageEvent>((subscriber) => {
      let cancelled = false;
      this.logger.log(`SSE open session=${sessionId}`);

      (async () => {
        try {
          for await (const chunk of this.conversation.streamMessage(
            sessionId,
            message,
          )) {
            if (cancelled) break;
            subscriber.next({ type: chunk.type, data: this.toData(chunk) });
          }
          if (!cancelled) {
            this.logger.log(`SSE done session=${sessionId}`);
            subscriber.complete();
          }
        } catch (err) {
          // 404 (session không tồn tại) hoặc lỗi trước khi stream → đẩy qua SSE error rồi complete.
          if (!cancelled) {
            subscriber.next({
              type: 'error',
              data: {
                code: 'STREAM_INIT_ERROR',
                message: (err as Error).message,
              },
            });
            subscriber.complete();
          }
        }
      })();

      // Teardown khi client ngắt kết nối (FR-013).
      return () => {
        cancelled = true;
        this.logger.log(`SSE closed session=${sessionId}`);
      };
    });
  }

  /** Fallback non-stream — tiện curl/test (R3). */
  @ApiAuth({ summary: 'Send message to conversation without SSE' })
  @Post(':sessionId/messages')
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateMessageDto,
  ): Promise<{ sessionId: string; reply: string; finishReason: string }> {
    return this.conversation.sendMessage(sessionId, dto.message);
  }

  private toData(chunk: AgentChunk): Record<string, unknown> {
    switch (chunk.type) {
      case 'token':
        return { text: chunk.text };
      case 'thinking':
        return { text: chunk.text };
      case 'tool':
        return {
          id: chunk.id,
          name: chunk.name,
          status: chunk.status,
          count: chunk.count,
          results: chunk.results,
        };
      case 'error':
        return { code: chunk.code, message: chunk.message };
      case 'done':
        return { finishReason: chunk.finishReason };
    }
  }
}
