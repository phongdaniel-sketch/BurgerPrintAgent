import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/redis/redis.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';
import { InMemoryRedis } from '../in-memory-redis';

/**
 * e2e US1: tạo phiên → stream nhận token...done; fallback trả reply.
 * Dùng FakeAgentRuntime (USE_FAKE_AGENT=true) + InMemoryRedis (không cần Redis thật).
 */
describe('Conversation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.USE_FAKE_AGENT = 'true';
    process.env.BURGERPRINTS_API_BASE_URL = 'https://api.example.com/v2';
    process.env.BURGERPRINTS_API_KEY = 'test-key';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(new InMemoryRedis())
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

  it('POST /conversations tạo phiên', async () => {
    const res = await request(app.getHttpServer()).post('/conversations').send({});
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
  });

  it('GET /conversations/:id/stream phát SSE token...done', async () => {
    const create = await request(app.getHttpServer()).post('/conversations').send({});
    const sid = create.body.sessionId;

    const res = await request(app.getHttpServer())
      .get(`/conversations/${sid}/stream`)
      .query({ message: 'Tôi muốn bán T-shirt thị trường Mỹ' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk) => (data += chunk));
        r.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: token');
    expect(res.body).toContain('event: done');
  });

  it('POST /conversations/:id/messages trả reply (fallback)', async () => {
    const create = await request(app.getHttpServer()).post('/conversations').send({});
    const sid = create.body.sessionId;

    const res = await request(app.getHttpServer())
      .post(`/conversations/${sid}/messages`)
      .send({ message: 'So sánh giá Hoodie giữa các xưởng' });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(sid);
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
    expect(res.body.finishReason).toBe('stop');
  });

  it('stream tới session không tồn tại → SSE error event', async () => {
    const res = await request(app.getHttpServer())
      .get('/conversations/does-not-exist/stream')
      .query({ message: 'hello' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk) => (data += chunk));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(res.body).toContain('event: error');
  });
});
