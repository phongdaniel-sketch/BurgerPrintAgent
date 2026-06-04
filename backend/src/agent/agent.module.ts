import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BurgerPrintsModule } from '../burgerprints/burgerprints.module';
import { BurgerPrintsService } from '../burgerprints/burgerprints.service';
import { AGENT_RUNTIME } from './agent-runtime.port';
import { FakeAgentRuntime } from './fake-agent.runtime';
import { PiAgentCoreRuntime } from './pi-agent-core.runtime';

/**
 * Provide AgentRuntime: chọn FakeAgentRuntime hay PiAgentCoreRuntime theo
 * USE_FAKE_AGENT (env). Cho phép chạy/test khi chưa có key/LLM thật.
 */
@Module({
  imports: [BurgerPrintsModule],
  providers: [
    FakeAgentRuntime,
    PiAgentCoreRuntime,
    {
      provide: AGENT_RUNTIME,
      inject: [ConfigService, BurgerPrintsService],
      useFactory: (config: ConfigService, burgerprints: BurgerPrintsService) => {
        const useFake = config.get<boolean>('llm.useFakeAgent');
        return useFake
          ? new FakeAgentRuntime()
          : new PiAgentCoreRuntime(config, burgerprints);
      },
    },
  ],
  exports: [AGENT_RUNTIME],
})
export class AgentModule {}
