import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from '../../config/app-config';
import { REFRESH_COOKIE } from '../../modules/auth/refresh-cookie';
import { METRICS_AUTH } from '../../modules/metrics/metrics.controller';

const DOCS_PATH = 'api/v1/docs';

// Committed beside package.json; resolved from src/common/openapi or dist/common/openapi.
export const OPENAPI_FILE = join(__dirname, '..', '..', '..', 'openapi.json');

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Checkpoint API')
    .setDescription(
      'Game catalog kept in sync with public Steam store data. Errors use RFC 9457 Problem Details.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_COOKIE)
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'METRICS_TOKEN' }, METRICS_AUTH)
    .build();
  return SwaggerModule.createDocument(app, config);
}

// Swagger UI and the JSON document. Off in production unless ENABLE_DOCS=true (docs/SPEC.md).
export function setupOpenApi(app: INestApplication): void {
  const config = app.get(AppConfig);
  if (config.nodeEnv === 'production' && !config.enableDocs) {
    return;
  }
  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
  });
}
