import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/redis/redis.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';
import { InMemoryRedis } from '../in-memory-redis';

/**
 * e2e US2 (SC-005): hai phiên độc lập không trộn lẫn lịch sử.
 */
describe('Session isolation (e2e)', () => {
  let app: INestApplication;
  let redis: InMemoryRedis;

  beforeAll(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.USE_FAKE_AGENT = 'true';
    process.env.BURGERPRINTS_API_BASE_URL = 'https://api.example.com/v2';
    process.env.BURGERPRINTS_API_KEY = 'test-key';

    redis = new InMemoryRedis();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(REDIS_CLIENT)
      .useValue({ quit: async () => undefined, disconnect: () => undefined })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lịch sử hai phiên không trộn lẫn', async () => {
    const server = app.getHttpServer();
    const a = (await request(server).post('/conversations').send({})).body.sessionId;
    const b = (await request(server).post('/conversations').send({})).body.sessionId;
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
