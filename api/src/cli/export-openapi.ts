import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { API_PREFIX } from '../common/configure-app';
import { OPENAPI_FILE, buildOpenApiDocument } from '../common/openapi/setup-openapi';
import { loadConfig } from '../config/app-config';
import { print, runCli } from './run-cli';

// npm run openapi:export: writes api/openapi.json, the committed inventory of endpoints
// (docs/DOCUMENTATION.md). test/openapi.e2e-spec.ts fails while it differs from the served one.

// The document depends on routes and DTOs only. Preview mode builds the module graph without
// instantiating providers, so nothing connects to these placeholder addresses.
const DOCUMENT_ONLY_ENV = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'https://checkpoint.invalid',
  DATABASE_URL: 'postgresql://unused@127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  JWT_SECRET: randomBytes(32).toString('hex'),
};

runCli(async () => {
  const app = await NestFactory.create(AppModule.forRoot(loadConfig(DOCUMENT_ONLY_ENV)), {
    preview: true,
    logger: false,
  });
  app.setGlobalPrefix(API_PREFIX);
  const document = buildOpenApiDocument(app);
  await app.close();
  await writeFile(OPENAPI_FILE, `${JSON.stringify(document, null, 2)}\n`);
  print(`Wrote ${OPENAPI_FILE}`);
});
