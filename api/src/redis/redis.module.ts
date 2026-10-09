import { Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { REDIS_CLIENT } from './redis.constants';

const CONNECT_TIMEOUT_MS = 2_000;

function createRedisClient(config: AppConfig): Redis {
  const logger = new Logger('Redis');
  const client = new Redis(config.redisUrl, { connectTimeout: CONNECT_TIMEOUT_MS });
  // Without a listener ioredis prints connection errors itself. It keeps reconnecting.
  client.on('error', (error: Error) => {
    logger.warn(`Redis connection error: ${error.message}`);
  });
  return client;
}

@Module({
  providers: [{ provide: REDIS_CLIENT, inject: [AppConfig], useFactory: createRedisClient }],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }
}
