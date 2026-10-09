import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './common/configure-app';
import { type AppConfig, loadConfig } from './config/app-config';
import { InvalidEnvironmentError } from './config/invalid-environment.error';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
    APP_OPTIONS,
  );
  configureApp(app);
  await app.listen(config.port);
}

void bootstrap();
