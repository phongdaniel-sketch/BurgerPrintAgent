import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';
import { SessionModule } from './session/session.module';
import { AgentModule } from './agent/agent.module';
import { BurgerPrintsModule } from './burgerprints/burgerprints.module';
import { ConversationModule } from './conversation/conversation.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthLoggingMiddleware } from './common/middlewares/auth-logging.middleware';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    SessionModule,
    UsersModule,
    AuthModule,
    BurgerPrintsModule,
    AgentModule,
    ConversationModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthLoggingMiddleware).forRoutes('auth');
  }
}
