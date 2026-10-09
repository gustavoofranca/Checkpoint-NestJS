import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { liveDependencies, testConfig } from './support/test-config';

describe('health', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('GET /health/live answers 200 without touching dependencies', async () => {
    app = await createTestApp();

    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200, { status: 'ok' });
  });

  it('GET /health/ready answers 200 when PostgreSQL and Redis are reachable', async () => {
    app = await createTestApp({ config: testConfig(liveDependencies()) });

    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200, { status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('GET /health/ready answers 503 naming the unreachable dependencies', async () => {
    app = await createTestApp();

    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      status: 503,
      title: 'Service Unavailable',
      detail: 'Unavailable dependencies: database, redis',
    });
  });

  it('GET /health/ready reports only the dependency that is down', async () => {
    const { DATABASE_URL } = liveDependencies();
    app = await createTestApp({ config: testConfig({ DATABASE_URL }) });

    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

    expect(response.body).toMatchObject({ detail: 'Unavailable dependencies: redis' });
  });
});
