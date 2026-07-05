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
    APP_MASTER_SECRET: z.string().min(32)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
}

export const env = parsed.data;

export const hasSqlConfig =
    Boolean(env.SQL_SERVER) &&
    Boolean(env.SQL_DATABASE) &&
    Boolean(env.SQL_USER) &&
    Boolean(env.SQL_PASSWORD);
