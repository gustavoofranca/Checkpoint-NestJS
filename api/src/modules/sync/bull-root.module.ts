import { BullModule } from '@nestjs/bullmq';
import { AppConfig } from '../../config/app-config';

// Shared BullMQ connection for the HTTP process (producer) and the worker (consumer). BullMQ opens
// its own connections from the URL (blocking reads need settings the shared fail-fast client does
// not have), keyed under the "checkpoint" prefix.
export const BullRootModule = BullModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({
    connection: { url: config.redisUrl },
    prefix: 'checkpoint',
  }),
});
