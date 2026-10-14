import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './common/configure-app';
import { initSentry } from './common/error-reporting/sentry';
import { loadConfigOrExit } from './config/load-config-or-exit';

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  initSentry(config);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    APP_OPTIONS,
  );
  configureApp(app);
  await app.listen(config.port);
}

void bootstrap();
