import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';
import { SessionModule } from './session/session.module';
import { AgentModule } from './agent/agent.module';
import { BurgerPrintsModule } from './burgerprints/burgerprints.module';
import { ConversationModule } from './conversation/conversation.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    SessionModule,
    BurgerPrintsModule,
    AgentModule,
    ConversationModule,
    HealthModule,
  ],
})
export class AppModule {}
