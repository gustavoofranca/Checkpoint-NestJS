import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/node';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initSentry } from '../src/common/error-reporting/sentry';
import { createTestApp } from './support/create-test-app';
import { ProbeController } from './support/probe.controller';
import { RecordingSentryTransport } from './support/recording-sentry-transport';
import { testConfig } from './support/test-config';

// Sentry runs for real; only its transport is replaced, so nothing leaves the machine.
describe('error reporting', () => {
  const transport = new RecordingSentryTransport();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const config = testConfig({ SENTRY_DSN: 'https://public@sentry.invalid/1' });
    expect(initSentry(config, { transport: transport.create })).toBe(true);
    app = await createTestApp({ config, controllers: [ProbeController] });
  });

  beforeEach(() => {
    transport.clear();
  });

  afterAll(async () => {
    await app.close();
    await Sentry.close();
  });

  it('reports an unexpected error tagged with the request id, without request data', async () => {
    const response = await http()
      .post('/api/v1/probe/crash?search=canary-query')
      .set('Authorization', 'Bearer eyJ.secret-access-token')
      .set('Cookie', 'refresh_token=opaque-refresh-token')
      .set('X-Canary', 'canary-header')
      .send({ email: 'canary@checkpoint.test', password: 'canary-password' })
      .expect(500);
    await Sentry.flush(2000);

    const events = transport.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tags: { request_id: response.get('X-Request-Id') } });
    const sent = JSON.stringify(events);
    expect(sent).toContain('Unexpected failure after reading the request body');
    for (const secret of [
      'secret-access-token',
      'opaque-refresh-token',
      'canary-header',
      'canary-query',
      'canary@checkpoint.test',
      'canary-password',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });

  it('does not report client errors', async () => {
    await http().get('/api/v1/no-such-route').expect(404);
    await http().post('/api/v1/probe').send({ name: '' }).expect(400);
    await Sentry.flush(2000);

    expect(transport.events()).toEqual([]);
  });
});
