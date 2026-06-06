import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';

/**
 * Ghi log từng turn của agent ra file JSONL để debug:
 *  - turn_start: message, model, có custom prompt không, số lượt history
 *  - tool: mỗi lần gọi tool (name + args + preview kết quả)
 *  - turn_end: reply cuối, finishReason, lỗi, thời gian xử lý
 *
 * File mặc định: backend/logs/agent-turns.jsonl (đổi qua env AGENT_LOG_FILE).
 * Mỗi dòng 1 JSON → dễ `tail -f`, grep, jq.
 */
@Injectable()
export class AgentLogger {
  private readonly logger = new Logger(AgentLogger.name);
  private readonly file =
    process.env.AGENT_LOG_FILE ||
    join(process.cwd(), 'logs', 'agent-turns.jsonl');
  private dirReady = false;

  async turnStart(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.write({ event: 'turn_start', sessionId, ...data });
  }

  async tool(
    sessionId: string,
    name: string,
    args: unknown,
    result: unknown,
  ): Promise<void> {
    await this.write({
      event: 'tool',
      sessionId,
      name,
      args,
      result: this.preview(result),
    });
  }

  async turnEnd(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.write({ event: 'turn_end', sessionId, ...data });
  }

  private async write(entry: Record<string, unknown>): Promise<void> {
    try {
      if (!this.dirReady) {
        await mkdir(dirname(this.file), { recursive: true });
        this.dirReady = true;
      }
      const line =
        JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
      await appendFile(this.file, line);
    } catch (e) {
      this.logger.warn(`Ghi agent log thất bại: ${(e as Error).message}`);
    }
  }

  /** Rút gọn payload lớn để log không phình. */
  private preview(v: unknown): unknown {
    try {
      const s = JSON.stringify(v);
      if (s && s.length > 2500) return s.slice(0, 2500) + '…(truncated)';
      return v;
    } catch {
      return String(v);
    }
  }
}
