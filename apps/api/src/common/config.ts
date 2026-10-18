export interface AiConfig {
  /** AI is enabled only when OLLAMA_BASE_URL is set. */
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
  batchSize: number;
  intervalSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  maxConcurrentRequests: number;
  maxInputChars: number;
  maxPromptChars: number;
  maxPendingPerUser: number;
  /** Per-user entries per local day (failed ones are refunded). */
  dailyLimit: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  sessionTtlDays: number;
  cookieSecure: boolean;
  allowRegistration: boolean;
  corsOrigins: string[];
  googleClientId?: string;
  schedulerEnabled: boolean;
  schedulerCron: string;
  swaggerEnabled: boolean;
  ai: AiConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : v === 'true');
  const int = (v: string | undefined, d: number, min = 1) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) && n >= min ? Math.floor(n) : d;
  };
  const baseUrl = (env.OLLAMA_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return {
    nodeEnv,
    port: Number(env.PORT ?? 3000),
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    cookieSecure: bool(env.COOKIE_SECURE, nodeEnv === 'production'),
    allowRegistration: bool(env.ALLOW_REGISTRATION, false),
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    googleClientId: env.GOOGLE_CLIENT_ID || undefined,
    schedulerEnabled: bool(env.SCHEDULER_ENABLED, true),
    schedulerCron: env.SCHEDULER_CRON || '*/5 * * * *',
    swaggerEnabled: bool(env.SWAGGER_ENABLED, nodeEnv !== 'production'),
    ai: {
      enabled: baseUrl !== '',
      baseUrl,
      model: (env.OLLAMA_MODEL ?? '').trim() || 'mistral',
      apiKey: env.OLLAMA_API_KEY?.trim() || undefined,
      batchSize: int(env.AI_BATCH_SIZE, 10),
      intervalSeconds: int(env.AI_SCHEDULER_INTERVAL_SECONDS, 30),
      requestTimeoutMs: int(env.AI_REQUEST_TIMEOUT_MS, 120_000, 1000),
      maxRetries: int(env.AI_MAX_RETRIES, 3, 0),
      maxConcurrentRequests: int(env.AI_MAX_CONCURRENT_REQUESTS, 1),
      maxInputChars: int(env.AI_MAX_INPUT_CHARS, 200),
      maxPromptChars: int(env.AI_MAX_PROMPT_CHARS, 6000, 500),
      maxPendingPerUser: int(env.AI_MAX_PENDING_PER_USER, 20),
      dailyLimit: int(env.AI_DAILY_LIMIT, 30),
    },
  };
}

export const APP_CONFIG = 'APP_CONFIG';
