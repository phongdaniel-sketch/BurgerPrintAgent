import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.checkRedis()]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      const up = await this.redis.ping();
      if (up) return { redis: { status: 'up' } };
      return { redis: { status: 'down' } };
    } catch (err) {
      return {
        redis: { status: 'down', message: (err as Error).message },
      };
    }
  }
}
