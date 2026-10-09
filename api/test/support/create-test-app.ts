import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { APP_OPTIONS, configureApp } from '../../src/common/configure-app';
import type { AppConfig } from '../../src/config/app-config';
import { testConfig } from './test-config';

interface TestAppOptions {
  config?: AppConfig;
  // Controllers that exist only in tests, to exercise the pipeline before real routes exist.
  controllers?: Type[];
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(options.config ?? testConfig())],
    controllers: options.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  configureApp(app);
  await app.init();
  return app;
}
