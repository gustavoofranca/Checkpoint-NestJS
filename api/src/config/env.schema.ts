import { z } from 'zod';

const MIN_JWT_SECRET_BYTES = 32;

// abort: an invalid URL reports one problem and skips the origin refinement.
const origin = z
  .url({ protocol: /^https?$/, abort: true })
  .refine((value) => new URL(value).origin === value, {
    message: 'must be a bare origin such as https://example.com, without path or trailing slash',
  });

export const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()))
    .pipe(z.array(origin).min(1)),
  DATABASE_URL: databaseUrl,
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // Swagger UI is always on outside production; in production only when this is "true".
  ENABLE_DOCS: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z
    .string()
    .refine((value) => Buffer.byteLength(value, 'utf8') >= MIN_JWT_SECRET_BYTES, {
      message: `must be at least ${String(MIN_JWT_SECRET_BYTES)} bytes`,
    }),
});

export type Env = z.infer<typeof envSchema>;
