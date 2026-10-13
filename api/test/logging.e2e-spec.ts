import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Role } from '../src/generated/prisma/client';
import {
  accessTokenFrom,
  newCredentials,
  refresh,
  refreshCookieFrom,
  registerAndLogin,
} from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { type LogEntry, LogCapture, loggedRequestId } from './support/log-capture';
import { ProbeController } from './support/probe.controller';
import { ALLOWED_ORIGIN, liveDependencies, testConfig } from './support/test-config';

describe('logging and audit', () => {
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

  // The one audit line recorded for an event.
  function onlyAudit(event: string): LogEntry {
    const entries = logs.audit(event);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry === undefined) {
      throw new Error(`no ${event} audit line`);
    }
    return entry;
  }

  async function userIdOf(email: string): Promise<string> {
    return (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  }

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

  it('records sign-up and sign-in with the user id and the request id', async () => {
    const credentials = newCredentials();
    const register = await http().post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const userId = await userIdOf(credentials.email);

    const registered = onlyAudit('auth.register');
    expect(registered).toMatchObject({ userId });
    expect(loggedRequestId(registered)).toBe(register.get('X-Request-Id'));
    const signedIn = onlyAudit('auth.login.succeeded');
    expect(signedIn).toMatchObject({ userId });
    expect(loggedRequestId(signedIn)).toBe(login.get('X-Request-Id'));
  });

  it('records failed logins with the user id only when the email matches an account', async () => {
    const { credentials } = await registerAndLogin(app);
    logs.clear();

    await http()
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'not the right password' })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@checkpoint.test', password: 'not the right password' })
      .expect(401);

    const failures = logs.audit('auth.login.failed');
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({ userId: await userIdOf(credentials.email) });
    expect(failures[1]).not.toHaveProperty('userId');
    expect(logs.text()).not.toContain('nobody@checkpoint.test');
    expect(logs.text()).not.toContain(credentials.email);
  });

  it('records refresh token reuse and logout with the user id', async () => {
    const signed = await registerAndLogin(app);
    const userId = await userIdOf(signed.credentials.email);
    await refresh(app, signed.refreshCookie).expect(200);

    const reuse = await refresh(app, signed.refreshCookie).expect(401);
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', signed.refreshCookie)
      .expect(204);

    const reused = onlyAudit('auth.refresh.reuse_detected');
    expect(reused).toMatchObject({ userId });
    expect(reused.familyId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(loggedRequestId(reused)).toBe(reuse.get('X-Request-Id'));
    expect(onlyAudit('auth.logout')).toMatchObject({ userId });
  });

  it('does not record a logout without a known session', async () => {
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', 'refresh_token=unknown')
      .expect(204);

    expect(logs.audit('auth.logout')).toEqual([]);
  });

  it('records an admin starting a sync', async () => {
    const admin = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: admin.credentials.email },
      data: { role: Role.ADMIN },
    });
    const adminToken = accessTokenFrom(
      await http()
        .post('/api/v1/auth/login')
        .send({ email: admin.credentials.email, password: admin.credentials.password })
        .expect(200),
    );

    const started = await http()
      .post('/api/v1/admin/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(202);

    expect(onlyAudit('admin.sync.started')).toMatchObject({
      userId: await userIdOf(admin.credentials.email),
      runId: z.object({ runId: z.uuid() }).parse(started.body).runId,
    });
  });

  it('logs the route pattern and the caller of each completed request', async () => {
    const signed = await registerAndLogin(app);
    const userId = await userIdOf(signed.credentials.email);
    logs.clear();

    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signed.accessToken}`)
      .expect(200);
    await http().get('/api/v1/games/no-such-game').expect(404);
    await http().get('/api/v1/no-such-route').expect(404);

    const completed = logs.entries().filter((entry) => entry.msg === 'request completed');
    expect(completed.map((entry) => ({ route: entry.route, userId: entry.userId }))).toEqual([
      { route: '/api/v1/auth/me', userId },
      { route: '/api/v1/games/:slug', userId: undefined },
      // Nest answers unknown paths from its own catch-all route.
      { route: '/api/v1*path', userId: undefined },
    ]);
  });
});
