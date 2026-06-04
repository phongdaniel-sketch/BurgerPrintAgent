import { forwardRef, Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [forwardRef(() => ConversationModule)],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
