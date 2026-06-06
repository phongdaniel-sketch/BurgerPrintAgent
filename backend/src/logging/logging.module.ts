import { Global, Module } from '@nestjs/common';
import { AgentLogger } from './agent-logger.service';

@Global()
@Module({
  providers: [AgentLogger],
  exports: [AgentLogger],
})
export class LoggingModule {}
