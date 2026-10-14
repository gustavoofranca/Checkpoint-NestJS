import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface CacheStats {
  hits: number;
  misses: number;
}

// Cache-aside over Redis for public data only (docs/ARCHITECTURE.md, Caching).
//
// Keys carry a namespace version: "games:v3:list:<hash>". Invalidating a namespace increments
// "games:version", which makes every older key unreachable at once without scanning; old keys
// expire by TTL (docs/adr/0007).
//
// A Redis failure never fails a request: it is logged and the loader's value is served.
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private hits = 0;
  private misses = 0;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Counters for the metrics endpoint (P7) and tests.
  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses };
  }

  // T must be a JSON value (plain objects, arrays, strings, numbers, booleans, null): what is
  // read back is what JSON.stringify wrote, so the cast below holds by construction.
  async getOrLoad<T>(
    namespace: string,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const fullKey = await this.versionedKey(namespace, key);
    if (fullKey !== null) {
      const cached = await this.attempt(() => this.redis.get(fullKey), null);
      if (cached !== null) {
        this.hits += 1;
        const value: unknown = JSON.parse(cached);
        return value as T;
      }
    }
    this.misses += 1;
    const value = await load();
    if (fullKey !== null) {
      await this.attempt(
        () => this.redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds),
        null,
      );
    }
    return value;
  }

  // Called after the data changed and the change is committed. A value cached concurrently under
  // the old version is written to a key no reader will build again.
  async invalidate(namespace: string): Promise<void> {
    await this.attempt(() => this.redis.incr(`${namespace}:version`), null);
  }

  private async versionedKey(namespace: string, key: string): Promise<string | null> {
    const version = await this.attempt(() => this.redis.get(`${namespace}:version`), undefined);
    if (version === undefined) {
      return null;
    }
    return `${namespace}:v${version ?? '0'}:${key}`;
  }

  private async attempt<R, F>(command: () => Promise<R>, fallback: F): Promise<R | F> {
    try {
      return await command();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache unavailable, serving from the database: ${reason}`);
      return fallback;
    }
  }
}
