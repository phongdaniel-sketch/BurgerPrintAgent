// Set env trước khi AppModule (ConfigModule validate env) được import.
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER ?? 'anthropic';
process.env.USE_FAKE_AGENT = 'true';
process.env.BURGERPRINTS_API_BASE_URL =
  process.env.BURGERPRINTS_API_BASE_URL ?? 'https://api.example.com/v2';
process.env.BURGERPRINTS_API_KEY = process.env.BURGERPRINTS_API_KEY ?? 'test-key';
