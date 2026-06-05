import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/redis/redis.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';
import { AGENT_RUNTIME } from '../../src/agent/agent-runtime.port';
import { InMemoryRedis } from '../in-memory-redis';
import { FakeAgentRuntime } from '../fake-agent.runtime';

/**
 * e2e US2 (SC-005): hai phiên độc lập không trộn lẫn lịch sử.
 */
describe('Session isolation (e2e)', () => {
  let app: INestApplication;
  let redis: InMemoryRedis;

  beforeAll(async () => {
    redis = new InMemoryRedis();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(REDIS_CLIENT)
      .useValue({ quit: async () => undefined, disconnect: () => undefined })
      .overrideProvider(AGENT_RUNTIME)
      .useValue(new FakeAgentRuntime())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lịch sử hai phiên không trộn lẫn', async () => {
    const server = app.getHttpServer();
    const a = (await request(server).post('/conversations').send({})).body
      .sessionId;
    const b = (await request(server).post('/conversations').send({})).body
      .sessionId;
    expect(a).not.toBe(b);

    await request(server)
      .post(`/conversations/${a}/messages`)
      .send({ message: 'CAU_HOI_PHIEN_A' });
    await request(server)
      .post(`/conversations/${b}/messages`)
      .send({ message: 'CAU_HOI_PHIEN_B' });

    const turnsA = (await redis.lrange(`session:${a}:turns`, 0, -1)).join('|');
    const turnsB = (await redis.lrange(`session:${b}:turns`, 0, -1)).join('|');

    expect(turnsA).toContain('CAU_HOI_PHIEN_A');
    expect(turnsA).not.toContain('CAU_HOI_PHIEN_B');
    expect(turnsB).toContain('CAU_HOI_PHIEN_B');
    expect(turnsB).not.toContain('CAU_HOI_PHIEN_A');
  });
});
