import { Server } from 'node:http';
import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from '../config/app-config';
import { MetricsService } from '../modules/metrics/metrics.service';
import { setupOpenApi } from './openapi/setup-openapi';
import { ProblemDetailsFilter } from './problem-details/problem-details.filter';
import { assignRequestId } from './request-id.middleware';
import { createValidationPipe } from './validation/create-validation-pipe';

export const API_PREFIX = 'api/v1';
const JSON_BODY_LIMIT = '100kb';

// A client gets this long to send its headers, and then its whole request. Node's defaults (60 s
// and 5 min) let slow clients hold connections open for minutes (docs/SECURITY.md section 4).
export const HEADERS_TIMEOUT_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 30_000;

// Nest's default parsers would also accept urlencoded bodies; the API is JSON only.
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false, bufferLogs: true };

// Shared by main.ts and the e2e tests, so tests exercise the real request pipeline.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  const server: unknown = app.getHttpServer();
  if (!(server instanceof Server)) {
    throw new Error('expected a Node.js HTTP server');
  }
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;

  // Express derives request.ip, which the rate limiter keys on, from this setting.
  app.set('trust proxy', config.trustProxyHops);
  app.use(assignRequestId);
  app.use(app.get(MetricsService).observeHttpRequest);
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
  setupOpenApi(app);
}
