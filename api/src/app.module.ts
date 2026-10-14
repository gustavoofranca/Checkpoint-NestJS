import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './common/logging/create-logger-params';
import type { AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { GamesModule } from './modules/games/games.module';
import { HealthModule } from './modules/health/health.module';
import { LibraryModule } from './modules/library/library.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(createLoggerParams(config)),
        // Before AuthModule: its global guard runs first, so unauthenticated floods are limited too.
        RateLimitModule,
        AuthModule,
        GamesModule,
        ReviewsModule,
        LibraryModule,
        UsersModule,
        HealthModule,
      ],
    };
  }
}
