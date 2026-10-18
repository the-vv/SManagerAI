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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : v === 'true');
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
  };
}

export const APP_CONFIG = 'APP_CONFIG';
