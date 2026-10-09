import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app';
import { ProbeController } from './support/probe.controller';
import { ALLOWED_ORIGIN } from './support/test-config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROBLEM_JSON = /^application\/problem\+json/;

describe('request pipeline', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('request id', () => {
    it('returns a generated id on every response', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('ignores an id sent by the client', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('X-Request-Id', 'forged-by-client');

      expect(response.headers['x-request-id']).toMatch(UUID);
      expect(response.headers['x-request-id']).not.toBe('forged-by-client');
    });
  });

  describe('errors', () => {
    it('returns Problem Details without internals for an unknown route', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'Cannot GET /api/v1/nope',
        requestId: response.headers['x-request-id'],
      });
    });

    it('hides the message of an unexpected error and keeps the request id', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/probe/crash').expect(500);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({
        title: 'Internal Server Error',
        status: 500,
        requestId: response.headers['x-request-id'],
      });
      expect(response.text).not.toMatch(/relation|users\.repository|\/srv\/app|stack/);
    });
  });

  describe('validation', () => {
    it('accepts a valid body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ name: 'Hades', rating: 5 })
        .expect(200, { name: 'Hades', rating: 5 });
    });

    it('rejects a property that is not in the DTO', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ name: 'Hades', rating: 5, role: 'ADMIN' })
        .expect(400);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({
        status: 400,
        errors: [{ field: 'role', message: 'property role should not exist' }],
      });
    });

    it('lists every invalid field', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ name: '', rating: 9 })
        .expect(400);

      expect(response.body).toMatchObject({
        errors: [
          { field: 'name', message: 'name must be longer than or equal to 1 characters' },
          { field: 'rating', message: 'rating must not be greater than 5' },
        ],
      });
    });

    it('rejects malformed JSON with Problem Details', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({ requestId: response.headers['x-request-id'] });
    });

    it('rejects a JSON body over 100 kb with Problem Details', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ name: 'x'.repeat(101 * 1024), rating: 1 })
        .expect(413);

      expect(response.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(response.body).toMatchObject({
        status: 413,
        requestId: response.headers['x-request-id'],
      });
    });
  });

  describe('security headers and CORS', () => {
    it('sets helmet headers and hides the framework', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('allows an origin from the allow-list with credentials', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not allow or reflect any other origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('Origin', 'https://evil.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
