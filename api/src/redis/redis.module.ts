import {
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

const CONNECT_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 500;
const READY_WAIT_MS = 2_000;

function createRedisClient(config: AppConfig): Redis {
  const logger = new Logger('Redis');
  const client = new Redis(config.redisUrl, {
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Fail fast instead of queueing while disconnected: callers (cache, rate limiter, health)
    // decide what an unavailable Redis means for them, without waiting on reconnects.
    enableOfflineQueue: false,
    commandTimeout: COMMAND_TIMEOUT_MS,
  });
  // Without a listener ioredis prints connection errors itself. It keeps reconnecting.
  client.on('error', (error: Error) => {
    logger.warn(`Redis connection error: ${error.message}`);
  });
  return client;
}

@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [AppConfig], useFactory: createRedisClient },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  // With the offline queue off, commands sent before the first connection fail. Waiting briefly
  // here lets the app serve its first requests with Redis; if Redis is down the app starts anyway.
  async onApplicationBootstrap(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, READY_WAIT_MS);
      this.client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }
}
