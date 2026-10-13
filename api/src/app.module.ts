import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './common/logging/create-logger-params';
import type { AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(createLoggerParams(config)),
        AuthModule,
        HealthModule,
      ],
    };
  }
}
