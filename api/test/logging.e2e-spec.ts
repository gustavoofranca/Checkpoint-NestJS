import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accessTokenFrom, newCredentials, refresh, refreshCookieFrom } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { LogCapture } from './support/log-capture';
import { ProbeController } from './support/probe.controller';
import { ALLOWED_ORIGIN, liveDependencies, testConfig } from './support/test-config';

describe('logging', () => {
  const prisma = createTestPrismaClient();
  const logs = new LogCapture();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      config: testConfig({ ...liveDependencies(), LOG_LEVEL: 'info' }),
      controllers: [ProbeController],
      logDestination: logs,
    });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    logs.clear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('logs a forced 500 with the request id that the response carries, and nothing internal in the response', async () => {
    const response = await http().get('/api/v1/probe/crash').expect(500);
    const requestId = response.get('X-Request-Id');

    expect(response.body).toMatchObject({ status: 500, requestId });
    expect(response.text).not.toMatch(/relation|users\.repository|\/srv\/app|stack/);
    const logged = logs.entries().find((entry) => entry.msg === 'Unexpected error');
    expect(logged).toMatchObject({ requestId });
    expect(JSON.stringify(logged?.err)).toContain('relation \\"users\\" does not exist');
  });

  it('keeps passwords, tokens and cookies out of the logs of a whole session', async () => {
    const credentials = newCredentials();
    await http().post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const accessToken = accessTokenFrom(login);
    const firstCookie = refreshCookieFrom(login);
    await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const rotated = refreshCookieFrom(await refresh(app, firstCookie).expect(200));
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', rotated)
      .expect(204);

    const output = logs.text();
    for (const secret of [
      credentials.password,
      accessToken,
      firstCookie.split('=')[1],
      rotated.split('=')[1],
      credentials.email,
    ]) {
      expect(secret).toBeDefined();
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[REDACTED]');
  });
});
