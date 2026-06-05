/**
 * Typed configuration namespaces nạp từ env.
 * KHÔNG đọc process.env rải rác nơi khác — luôn qua ConfigService.get('<ns>.<key>').
 */
export interface AppConfig {
  port: number;
}
export interface RedisConfig {
  url: string;
}
export interface SessionConfig {
  ttlSeconds: number;
  maxContextTurns: number;
}
export interface MongoConfig {
  uri: string;
}
export interface JwtConfig {
  secret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}
export interface OAuthConfig {
  google: {
    clientID?: string;
    clientSecret?: string;
    callbackURL?: string;
  };
}
export interface LlmConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  /** Override endpoint cho OpenAI-compatible API (proxy/Azure/OpenRouter/local). */
  openaiBaseUrl?: string;
}
export interface BurgerPrintsConfig {
  baseUrl: string;
  apiKey: string;
  cacheTtlSeconds: number;
}

export interface RootConfig {
  app: AppConfig;
  redis: RedisConfig;
  session: SessionConfig;
  mongo: MongoConfig;
  jwt: JwtConfig;
  oauth: OAuthConfig;
  llm: LlmConfig;
  burgerprints: BurgerPrintsConfig;
}

export default (): RootConfig => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
  redis: {
    url: process.env.REDIS_URL as string,
  },
  session: {
    ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? '3600', 10),
    maxContextTurns: parseInt(process.env.MAX_CONTEXT_TURNS ?? '12', 10),
  },
  mongo: {
    uri: process.env.MONGODB_URI as string,
  },
  jwt: {
    secret: process.env.JWT_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  oauth: {
    google: {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
  },
  llm: {
    provider: (process.env.LLM_PROVIDER ?? 'anthropic') as
      | 'anthropic'
      | 'openai',
    model:
      process.env.LLM_MODEL ??
      (process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5'),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  },
  burgerprints: {
    baseUrl: process.env.BURGERPRINTS_API_BASE_URL as string,
    apiKey: process.env.BURGERPRINTS_API_KEY as string,
    cacheTtlSeconds: parseInt(
      process.env.CATALOG_CACHE_TTL_SECONDS ?? '300',
      10,
    ),
  },
});
