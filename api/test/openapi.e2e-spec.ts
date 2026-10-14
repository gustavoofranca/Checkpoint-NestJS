import { readFile } from 'node:fs/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPENAPI_FILE } from '../src/common/openapi/setup-openapi';
import { createTestApp } from './support/create-test-app';

describe('committed OpenAPI document', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Fails when a route or DTO changed without `npm run build && npm run openapi:export`.
  it('matches the document the API serves', async () => {
    const committed: unknown = JSON.parse(await readFile(OPENAPI_FILE, 'utf8'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/docs/openapi.json')
      .expect(200);

    expect(committed).toEqual(response.body);
  });
});
