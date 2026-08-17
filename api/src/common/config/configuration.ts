import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(v ?? '', 10);
      return Number.isFinite(n) ? n : fallback;
    });

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4010),
  API_BASE_URL: z.string().default('http://localhost:4010'),
  WEB_BASE_URL: z.string().default('http://localhost:3015'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: int(30),

  TICKET_SECRET: z.string().min(16, 'TICKET_SECRET must be at least 16 characters'),
  TICKET_TTL_SECONDS: int(300),

  /// Bootstrap key for tenant provisioning, before any platform staff exist.
  /// Leave blank in production once real staff accounts are flagged.
  PLATFORM_ADMIN_KEY: z.string().optional().default(''),

  /// hosted = Calm runs one multi-tenant deployment
  /// dedicated = a deployment in the client's own cloud account
  /// onprem = the client's own servers, possibly with no internet at all
  DEPLOYMENT_MODE: z.enum(['hosted', 'dedicated', 'onprem']).default('hosted'),

  /// Calm's licence-signing public key. Subscriptions verify against this with
  /// no network call, so an on-premise install works offline.
  LICENSE_PUBLIC_KEY: z.string().optional().default(''),
  /// Deployment-wide licence, for on-premise installs where one subscription
  /// covers the whole installation. Hosted tenants carry their own instead.
  LICENSE_KEY: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  MAX_UPLOAD_BYTES: int(200 * 1024 * 1024),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),

  DEFAULT_SHARE_TTL_HOURS: int(168),
  /// Days a soft-deleted item sits in the recycle bin before it can be purged.
  RECYCLE_BIN_DAYS: int(30),

  REDIS_URL: z.string().optional().default(''),

  WHATSAPP_ENABLED: bool(false),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_GRAPH_VERSION: z.string().default('v21.0'),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),

  EMAIL_ENABLED: bool(false),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Arkin <no-reply@example.com>'),
  EMAIL_INBOUND_SECRET: z.string().optional().default(''),

  AI_PROVIDER: z.enum(['anthropic', 'none']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('claude-sonnet-5'),

  OCR_SERVICE_URL: z.string().optional().default(''),
  GOTENBERG_URL: z.string().optional().default(''),
  ONLYOFFICE_URL: z.string().optional().default(''),
});

export type AppConfig = ReturnType<typeof loadConfiguration>;

export function loadConfiguration() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';

  const config = {
    env: e.NODE_ENV,
    isProd,
    port: e.PORT,
    apiBaseUrl: e.API_BASE_URL.replace(/\/$/, ''),
    webBaseUrl: e.WEB_BASE_URL.replace(/\/$/, ''),
    corsOrigins: e.CORS_ORIGINS.length ? e.CORS_ORIGINS : [e.WEB_BASE_URL],

    jwt: {
      secret: e.JWT_SECRET,
      accessTtl: e.JWT_ACCESS_TTL,
      refreshTtlDays: e.JWT_REFRESH_TTL_DAYS,
    },

    ticket: {
      secret: e.TICKET_SECRET,
      ttlSeconds: e.TICKET_TTL_SECONDS,
    },

    platformAdminKey: e.PLATFORM_ADMIN_KEY,
    deploymentMode: e.DEPLOYMENT_MODE,

    license: {
      publicKey: e.LICENSE_PUBLIC_KEY,
      key: e.LICENSE_KEY,
    },

    storage: {
      driver: e.STORAGE_DRIVER,
      localDir: e.STORAGE_LOCAL_DIR,
      maxUploadBytes: e.MAX_UPLOAD_BYTES,
      s3: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      },
    },

    shares: {
      defaultTtlHours: e.DEFAULT_SHARE_TTL_HOURS,
    },

    recycleBinDays: e.RECYCLE_BIN_DAYS,

    redisUrl: e.REDIS_URL,

    whatsapp: {
      enabled: e.WHATSAPP_ENABLED,
      phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: e.WHATSAPP_ACCESS_TOKEN,
      graphVersion: e.WHATSAPP_GRAPH_VERSION,
      verifyToken: e.WHATSAPP_VERIFY_TOKEN,
      appSecret: e.WHATSAPP_APP_SECRET,
    },

    email: {
      enabled: e.EMAIL_ENABLED,
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      user: e.SMTP_USER,
      pass: e.SMTP_PASS,
      from: e.MAIL_FROM,
      inboundSecret: e.EMAIL_INBOUND_SECRET,
    },

    ai: {
      provider: e.AI_PROVIDER,
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.AI_MODEL,
    },

    services: {
      ocrUrl: e.OCR_SERVICE_URL,
      gotenbergUrl: e.GOTENBERG_URL,
      onlyofficeUrl: e.ONLYOFFICE_URL,
    },
  };

  assertProductionSafety(config);
  return config;
}

/**
 * Refuse to boot production with development defaults. A silent fallback here
 * is exactly the kind of thing that turns into an audit finding.
 */
function assertProductionSafety(config: {
  isProd: boolean;
  jwt: { secret: string };
  ticket: { secret: string };
  whatsapp: { enabled: boolean; appSecret: string };
  email: { enabled: boolean; inboundSecret: string };
}) {
  if (!config.isProd) return;

  const problems: string[] = [];
  if (config.jwt.secret.startsWith('dev-')) problems.push('JWT_SECRET is still a dev value');
  if (config.ticket.secret.startsWith('dev-')) problems.push('TICKET_SECRET is still a dev value');
  if (config.whatsapp.enabled && !config.whatsapp.appSecret) {
    problems.push('WHATSAPP_APP_SECRET is required to verify inbound webhook signatures');
  }
  if (config.email.enabled && !config.email.inboundSecret) {
    problems.push('EMAIL_INBOUND_SECRET is required to authenticate the inbound mail webhook');
  }

  if (problems.length) {
    throw new Error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`);
  }
}
