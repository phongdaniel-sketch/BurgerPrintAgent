// Set env trước khi AppModule (ConfigModule validate env) được import.
// Agent runtime được override bằng test-double trong từng e2e spec, nên key chỉ
// cần để qua validation (không gọi LLM thật).
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.LLM_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.BURGERPRINTS_API_BASE_URL =
  process.env.BURGERPRINTS_API_BASE_URL ?? 'https://api.example.com/v2';
process.env.BURGERPRINTS_API_KEY = process.env.BURGERPRINTS_API_KEY ?? 'test-key';
