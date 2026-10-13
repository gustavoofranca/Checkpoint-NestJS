import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { APP_OPTIONS, configureApp } from '../../src/common/configure-app';
import type { AppConfig } from '../../src/config/app-config';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { recordLeakingResponses } from './response-leak-guard';
import { testConfig } from './test-config';

interface TestAppOptions {
  config?: AppConfig;
  // Controllers that exist only in tests, to exercise the pipeline before real routes exist.
  controllers?: Type[];
  // A real client to use instead of PrismaService, for instance one that counts queries.
  prisma?: PrismaClient<'query'>;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule.forRoot(options.config ?? testConfig())],
    controllers: options.controllers ?? [],
  });
  if (options.prisma !== undefined) {
    builder.overrideProvider(PrismaService).useValue(options.prisma);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  // First, so it sees every response, error responses included (test/support/e2e-setup.ts).
  app.use(recordLeakingResponses);
  configureApp(app);
  await app.init();
  return app;
}
