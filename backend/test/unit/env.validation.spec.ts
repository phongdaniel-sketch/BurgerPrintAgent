import { envValidationSchema } from '../../src/config/env.validation';

const baseEnv = {
  REDIS_URL: 'redis://localhost:6379',
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'k',
  BURGERPRINTS_API_BASE_URL: 'https://api.example.com/v2',
  BURGERPRINTS_API_KEY: 'k',
};

describe('env validation schema', () => {
  it('pass với env hợp lệ + default được điền', () => {
    const { error, value } = envValidationSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
    expect(value.SESSION_TTL_SECONDS).toBe(3600);
  });

  it('fail và nêu đích danh khi thiếu REDIS_URL (SC-006)', () => {
    const { REDIS_URL, ...env } = baseEnv;
    const { error } = envValidationSchema.validate(env);
    expect(error).toBeDefined();
    expect(error!.message).toContain('REDIS_URL');
  });

  it('fail khi thiếu ANTHROPIC_API_KEY mà provider=anthropic', () => {
    const { ANTHROPIC_API_KEY, ...env } = baseEnv;
    const { error } = envValidationSchema.validate(env);
    expect(error).toBeDefined();
    expect(error!.message).toContain('ANTHROPIC_API_KEY');
  });

  it('yêu cầu OPENAI_API_KEY khi provider=openai', () => {
    const env = { ...baseEnv, LLM_PROVIDER: 'openai', ANTHROPIC_API_KEY: '' };
    const { error } = envValidationSchema.validate(env);
    expect(error).toBeDefined();
    expect(error!.message).toContain('OPENAI_API_KEY');
  });

  it('fail khi LLM_PROVIDER không hợp lệ', () => {
    const env = { ...baseEnv, LLM_PROVIDER: 'gemini' };
    const { error } = envValidationSchema.validate(env);
    expect(error).toBeDefined();
    expect(error!.message).toContain('LLM_PROVIDER');
  });
});
