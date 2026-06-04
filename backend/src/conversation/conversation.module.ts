import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { SessionModule } from '../session/session.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [SessionModule, AgentModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
