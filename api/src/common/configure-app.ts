import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from '../config/app-config';
import { ProblemDetailsFilter } from './problem-details/problem-details.filter';
import { assignRequestId } from './request-id.middleware';
import { createValidationPipe } from './validation/create-validation-pipe';

export const API_PREFIX = 'api/v1';
const JSON_BODY_LIMIT = '100kb';

// Nest's default parsers would also accept urlencoded bodies; the API is JSON only.
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false, bufferLogs: true };

// Shared by main.ts and the e2e tests, so tests exercise the real request pipeline.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.use(assignRequestId);
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: [...config.corsOrigins], credentials: true });
  // Unsigned: the refresh cookie is an opaque random token checked against its stored hash.
  app.use(cookieParser());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
}
