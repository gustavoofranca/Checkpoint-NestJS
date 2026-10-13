import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { RedisModule } from '../redis/redis.module';
import { AppThrottlerGuard } from './app-throttler.guard';
import { accountOf, authRateLimitOf } from './auth-rate-limit.decorator';
import { RedisThrottlerStorage } from './redis-throttler.storage';

// Limits per docs/SECURITY.md section 4 (docs/adr/0008):
// - default: every route, per client IP.
// - auth-ip: credential routes (@AuthRateLimit), per client IP.
// - auth-account: login and register, per email in the body, so spreading guesses over many IPs
//   does not help.
const AUTH_IP = 'auth-ip';
const AUTH_ACCOUNT = 'auth-account';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        setHeaders: false,
        storage: new RedisThrottlerStorage(redis, new Set([AUTH_IP, AUTH_ACCOUNT])),
        throttlers: [
          { name: 'default', ttl: minutes(1), limit: 300 },
          {
            name: AUTH_IP,
            ttl: minutes(15),
            limit: 30,
            blockDuration: minutes(15),
            skipIf: (context) => authRateLimitOf(context) === undefined,
          },
          {
            name: AUTH_ACCOUNT,
            ttl: minutes(15),
            limit: 5,
            blockDuration: minutes(15),
            getTracker: (request: Record<string, unknown>) => accountOf(request) ?? '',
            skipIf: (context) =>
              authRateLimitOf(context)?.perAccount !== true ||
              accountOf(context.switchToHttp().getRequest<Record<string, unknown>>()) === undefined,
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class RateLimitModule {}
