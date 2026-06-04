import { Module } from '@nestjs/common';
import { BurgerPrintsModule } from '../burgerprints/burgerprints.module';
import { AGENT_RUNTIME } from './agent-runtime.port';
import { PiAgentCoreRuntime } from './pi-agent-core.runtime';

/**
 * Provide AgentRuntime = PiAgentCoreRuntime (in-process pi-agent-core).
 * Trong test, provider AGENT_RUNTIME được override bằng một test-double.
 */
@Module({
  imports: [BurgerPrintsModule],
  providers: [{ provide: AGENT_RUNTIME, useClass: PiAgentCoreRuntime }],
  exports: [AGENT_RUNTIME],
})
export class AgentModule {}
