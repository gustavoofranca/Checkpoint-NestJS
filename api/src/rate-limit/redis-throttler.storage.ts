import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// Same shape as @nestjs/throttler's ThrottlerStorageRecord, which its index does not export.
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// One atomic step per request. KEYS[1] counts hits in the window, KEYS[2] marks a block.
// ARGV: window ms, limit, block ms. Returns { hits, window ms left, block ms left (0 if none) }.
// While blocked, requests are not counted, the same as @nestjs/throttler's in-memory storage.
const INCREMENT_SCRIPT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), blocked }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local remaining = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, remaining, tonumber(ARGV[3]) }
end
return { hits, remaining, 0 }
`;

const scriptResultSchema = z.tuple([z.number(), z.number(), z.number()]);

const toSeconds = (milliseconds: number) => Math.ceil(Math.max(milliseconds, 0) / 1000);

// Counters live in Redis, so every API process shares them.
//
// When Redis is unreachable, throttlers listed in `failClosed` reject the request with 503 (a
// limiter that cannot count must not let password guessing through); the others let it pass and
// log a warning, so the public API keeps working (docs/adr/0008).
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('RateLimit');

  constructor(
    private readonly redis: Redis,
    private readonly failClosed: ReadonlySet<string>,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    let raw: unknown;
    try {
      raw = await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `throttle:${key}`,
        `throttle:${key}:blocked`,
        ttl,
        limit,
        Math.max(blockDuration, 1),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (this.failClosed.has(throttlerName)) {
        this.logger.error(`Rate limiter "${throttlerName}" unavailable, rejecting: ${reason}`);
        throw new ServiceUnavailableException(
          'This action is temporarily unavailable. Try again in a moment.',
        );
      }
      this.logger.warn(`Rate limiter "${throttlerName}" unavailable, allowing: ${reason}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }

    const [totalHits, windowLeft, blockLeft] = scriptResultSchema.parse(raw);
    return {
      totalHits,
      timeToExpire: toSeconds(windowLeft),
      isBlocked: blockLeft > 0,
      timeToBlockExpire: toSeconds(blockLeft),
    };
  }
}
