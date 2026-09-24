import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const REQUIRED_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PORT = 65_535;
const MIN_TRUST_PROXY_HOPS = 0;
const MAX_TRUST_PROXY_HOPS = 5;
const DEFAULT_TRUST_PROXY_HOPS = 1;

const requiredStringSchema = z.string().trim().min(1);

const postgresUrlSchema = requiredStringSchema.refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  } catch {
    return false;
  }
}, 'Must be a PostgreSQL URL');

const emptyStringToUndefined = (value: unknown) =>
  value === '' ? undefined : value;

const optionalUrlSchema = z.preprocess(
  emptyStringToUndefined,
  z.url().optional(),
);

const nodeEnvSchema = z.preprocess(
  emptyStringToUndefined,
  z.enum(['development', 'test', 'production']).default('development'),
);

const portSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().min(1).max(MAX_PORT).default(3000),
);

const trustProxyHopsSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce
    .number()
    .int()
    .min(MIN_TRUST_PROXY_HOPS)
    .max(MAX_TRUST_PROXY_HOPS)
    .default(DEFAULT_TRUST_PROXY_HOPS),
);

const timezoneSchema = requiredStringSchema.refine((value) => {
  try {
    Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Must be an IANA timezone');

export const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: postgresUrlSchema,
  DIRECT_URL: postgresUrlSchema,
  JWT_SECRET: z.string().min(REQUIRED_SECRET_LENGTH),
  CORS_ORIGIN: requiredStringSchema.transform((value, context) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    for (const origin of origins) {
      if (!z.url().safeParse(origin).success) {
        context.addIssue({
          code: 'custom',
          message: `Invalid origin: ${origin}`,
        });
      }
    }

    return origins;
  }),
  CLOUDINARY_URL: requiredStringSchema.refine(
    (value) => value.startsWith('cloudinary://'),
    'Must be a Cloudinary URL',
  ),
  SENTRY_DSN: optionalUrlSchema,
  MAINTENANCE_TOKEN: z.string().min(REQUIRED_SECRET_LENGTH),
  DEMO_ADMIN_LOGIN: z.string().regex(/^[a-z0-9._-]{3,40}$/),
  DEMO_ADMIN_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH),
  SANDBOX_RESET_TIME: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  SANDBOX_TIMEZONE: timezoneSchema,
  PORT: portSchema,
  TRUST_PROXY_HOPS: trustProxyHopsSchema,
});

export type AppEnv = z.infer<typeof envSchema>;
export type AppConfigService = ConfigService<AppEnv, true>;

export class EnvValidationError extends Error {
  readonly fields: string[];

  constructor(error: z.ZodError) {
    const fields = [
      ...new Set(
        error.issues.map((issue) => String(issue.path[0] ?? 'environment')),
      ),
    ];

    super(`Invalid environment configuration: ${fields.join(', ')}`);
    this.name = 'EnvValidationError';
    this.fields = fields;
  }
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new EnvValidationError(result.error);
  }

  return result.data;
}
