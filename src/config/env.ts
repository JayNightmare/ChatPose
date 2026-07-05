import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('ChatPose'),
  SQL_DIALECT: z.enum(['mssql', 'mysql']).default('mssql'),
  P2P_LISTEN_PORT: z.coerce.number().int().nonnegative().default(0),
  P2P_TOPIC: z.string().min(3).default('chatpose/secure-session/1.0.0'),
  SIGNAL_BOOTSTRAP: z.string().default(''),
  SQL_SERVER: z.string().min(1).optional(),
  SQL_DATABASE: z.string().min(1).optional(),
  SQL_USER: z.string().min(1).optional(),
  SQL_PASSWORD: z.string().min(1).optional(),
  SQL_PORT: z.coerce.number().int().positive().default(1433),
  SQL_ENCRYPT: z.coerce.boolean().default(true),
  SQL_TRUST_SERVER_CERT: z.coerce.boolean().default(false),
  SQL_SSL: z.coerce.boolean().default(false),
  SQL_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
  SQL_SSL_CA_FILE: z.string().optional(),
  SQL_SSL_CERT_FILE: z.string().optional(),
  SQL_SSL_KEY_FILE: z.string().optional(),
  EMAIL_CHECK_MODE: z.enum(['off', 'warn', 'strict']).default('warn'),
  APP_MASTER_SECRET: z.string().min(32)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
}

export const env = parsed.data;

const placeholderLike = new Set(['replace-me', 'changeme', 'your-host', 'your-user', 'your-password']);

function hasRealValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !placeholderLike.has(normalized);
}

export const hasSqlConfig =
  hasRealValue(env.SQL_SERVER) &&
  hasRealValue(env.SQL_DATABASE) &&
  hasRealValue(env.SQL_USER) &&
  hasRealValue(env.SQL_PASSWORD);
