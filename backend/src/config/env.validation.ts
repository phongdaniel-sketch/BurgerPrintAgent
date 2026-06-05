import * as Joi from 'joi';

/**
 * Joi schema validate env khi bootstrap. Fail-fast nếu thiếu/không hợp lệ,
 * thông báo nêu đích danh biến (FR-009, SC-006). Key LLM là conditional theo provider.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().default(3000),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional().allow(''),

  SESSION_TTL_SECONDS: Joi.number().integer().positive().default(3600),
  MAX_CONTEXT_TURNS: Joi.number().integer().positive().default(12),

  LLM_PROVIDER: Joi.string().valid('anthropic', 'openai').required(),
  LLM_MODEL: Joi.string().optional().allow(''),
  ANTHROPIC_API_KEY: Joi.string().when('LLM_PROVIDER', {
    is: 'anthropic',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  OPENAI_API_KEY: Joi.string().when('LLM_PROVIDER', {
    is: 'openai',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  OPENAI_BASE_URL: Joi.string().uri().optional().allow(''),

  BURGERPRINTS_API_BASE_URL: Joi.string().uri().required(),
  BURGERPRINTS_API_KEY: Joi.string().required(),
  CATALOG_CACHE_TTL_SECONDS: Joi.number().integer().positive().default(300),
})
  // Báo tất cả lỗi cùng lúc thay vì dừng ở lỗi đầu tiên
  .options({ abortEarly: false });
