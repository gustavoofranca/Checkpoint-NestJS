import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { takeLeaks } from './response-leak-guard';
import { TEST_REDIS_DB } from './test-database-url';

// The test Redis database (see vitest.config.mts). Emptied before every e2e test, so rate-limit
// counters and cache entries from one test never decide another one's outcome.
const redisUrl = process.env.REDIS_URL;
const redis =
  redisUrl === undefined
    ? undefined
    : new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

beforeEach(async () => {
  if (redis === undefined) {
    return;
  }
  if (redis.options.db !== TEST_REDIS_DB) {
    throw new Error(`Refusing to flush Redis database ${String(redis.options.db)}`);
  }
  await redis.flushdb();
});

// Fails any e2e test whose responses carried a password or token hash (docs/PLAN.md, P2).
afterEach(() => {
  expect(takeLeaks(), 'responses that exposed a password or token hash').toEqual([]);
});

afterAll(() => {
  redis?.disconnect();
});
