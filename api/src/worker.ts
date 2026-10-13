import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadConfigOrExit } from './config/load-config-or-exit';
import { WorkerModule } from './worker.module';

// A separate process for background work (docs/adr/0010): it consumes the catalog sync queue and
// keeps the daily schedule. npm run worker.
async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void bootstrap();
