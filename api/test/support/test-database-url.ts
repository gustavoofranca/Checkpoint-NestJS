const TEST_SUFFIX = '_test';

// Tests write and delete rows, so they run against a sibling database: checkpoint becomes
// checkpoint_test on the same server. Idempotent, so it is safe to apply twice.
export function toTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');
  if (name === '') {
    throw new Error('DATABASE_URL must name a database');
  }
  if (!name.endsWith(TEST_SUFFIX)) {
    url.pathname = `/${name}${TEST_SUFFIX}`;
  }
  return url.href;
}

export const TEST_REDIS_DB = 1;

// Same idea for Redis: tests use logical database 1, development uses 0, so rate-limit counters
// and cache entries written by tests never reach the development data.
export function toTestRedisUrl(redisUrl: string): string {
  const url = new URL(redisUrl);
  url.pathname = `/${String(TEST_REDIS_DB)}`;
  return url.href;
}
