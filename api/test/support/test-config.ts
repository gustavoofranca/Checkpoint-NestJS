import { randomBytes } from 'node:crypto';
import { type AppConfig, loadConfig } from '../../src/config/app-config';

export const ALLOWED_ORIGIN = 'http://localhost:5173';

// Nothing listens on port 1, so connections are refused immediately.
export const UNREACHABLE_DATABASE_URL = 'postgresql://checkpoint:unused@127.0.0.1:1/checkpoint';
export const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';

// A valid environment for tests. Dependencies are unreachable unless a test overrides them.
export function testEnv(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: ALLOWED_ORIGIN,
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
    REDIS_URL: UNREACHABLE_REDIS_URL,
    JWT_SECRET: randomBytes(32).toString('hex'),
    ...overrides,
  };
}

export function testConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): AppConfig {
  return loadConfig(testEnv(overrides));
}

// The real PostgreSQL and Redis: from the repository .env locally, from the job environment in CI.
export function liveDependencies(): { DATABASE_URL: string; REDIS_URL: string } {
  const { DATABASE_URL, REDIS_URL } = process.env;
  if (DATABASE_URL === undefined || REDIS_URL === undefined) {
    throw new Error('DATABASE_URL and REDIS_URL must be set to run tests against live services');
  }
  return { DATABASE_URL, REDIS_URL };
}
