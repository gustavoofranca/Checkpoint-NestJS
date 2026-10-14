import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerParams } from './common/logging/create-logger-params';
import type { AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { BullRootModule } from './modules/sync/bull-root.module';
import { SyncWorkerModule } from './modules/sync/sync-worker.module';

// The queue worker's application: no HTTP server, no controllers, no guards.
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(createLoggerParams(config)),
        BullRootModule,
        SyncWorkerModule,
      ],
    };
  }
}
