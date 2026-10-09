import { randomBytes, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config/app-config';
import { Role } from '../src/generated/prisma/client';
import { INVALID_CREDENTIALS, INVALID_SESSION } from '../src/modules/auth/auth.service';
import { PasswordHasher } from '../src/modules/users/password-hasher';
import { REGISTRATION_CONFLICT } from '../src/modules/users/users.service';
import {
  accessTokenFrom,
  forgeToken,
  newCredentials,
  refresh,
  refreshCookieFrom,
  registerAndLogin,
  unsignedToken,
} from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { ProbeController, ProtectedProbeController } from './support/probe.controller';
import { takeLeaks } from './support/response-leak-guard';
import { ALLOWED_ORIGIN, liveDependencies, testConfig } from './support/test-config';

// Problem Details carry a per-request id; everything else must match exactly.
function withoutRequestId(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return body;
  }
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'requestId'));
}

describe('auth', () => {
  const prisma = createTestPrismaClient();
  let config: AppConfig;
  let app: NestExpressApplication;

  beforeAll(async () => {
    config = testConfig(liveDependencies());
    app = await createTestApp({ config, controllers: [ProbeController, ProtectedProbeController] });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /auth/register', () => {
    it('creates a user and returns it without the password hash', async () => {
      const credentials = newCredentials();

      const response = await http()
        .post('/api/v1/auth/register')
        .send({ ...credentials, email: `  ${credentials.email.toUpperCase()} ` })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String) as unknown,
        email: credentials.email,
        username: credentials.username,
        role: Role.USER,
        createdAt: expect.any(String) as unknown,
      });
    });

    it('rejects a body that tries to set the role', async () => {
      const credentials = newCredentials();

      const response = await http()
        .post('/api/v1/auth/register')
        .send({ ...credentials, role: Role.ADMIN })
        .expect(400);

      expect(response.body).toMatchObject({
        errors: [{ field: 'role', message: 'property role should not exist' }],
      });
      expect(await prisma.user.count()).toBe(0);
    });

    it('answers the same 409 for a taken email and a taken username', async () => {
      const taken = newCredentials();
      await http().post('/api/v1/auth/register').send(taken).expect(201);

      const sameEmail = await http()
        .post('/api/v1/auth/register')
        .send({ ...newCredentials(), email: taken.email })
        .expect(409);
      const sameUsername = await http()
        .post('/api/v1/auth/register')
        .send({ ...newCredentials(), username: taken.username })
        .expect(409);

      expect(sameEmail.body).toMatchObject({ detail: REGISTRATION_CONFLICT });
      expect(withoutRequestId(sameEmail.body)).toEqual(withoutRequestId(sameUsername.body));
    });

    it.each([
      ['a password of 11 characters', { password: 'x'.repeat(11) }],
      ['a password of 129 characters', { password: 'x'.repeat(129) }],
      ['an uppercase username', { username: 'Player' }],
      ['an invalid email', { email: 'not-an-email' }],
      ['an email that is not a string', { email: 12345 }],
    ])('rejects %s', async (_, override) => {
      await http()
        .post('/api/v1/auth/register')
        .send({ ...newCredentials(), ...override })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access token and sets the refresh cookie with the required attributes', async () => {
      const credentials = newCredentials();
      await http().post('/api/v1/auth/register').send(credentials).expect(201);

      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: credentials.email.toUpperCase(), password: credentials.password })
        .expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String) as unknown,
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      const cookie = response.get('Set-Cookie')?.[0] ?? '';
      expect(cookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      const expires = Date.parse(/Expires=([^;]+)/.exec(cookie)?.[1] ?? '');
      expect(expires - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    });

    it('answers an unknown email and a wrong password identically', async () => {
      const credentials = newCredentials();
      await http().post('/api/v1/auth/register').send(credentials).expect(201);

      const unknownEmail = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@checkpoint.test', password: credentials.password })
        .expect(401);
      const wrongPassword = await http()
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'wrong password entirely' })
        .expect(401);

      expect(unknownEmail.body).toMatchObject({ detail: INVALID_CREDENTIALS });
      expect(withoutRequestId(unknownEmail.body)).toEqual(withoutRequestId(wrongPassword.body));
      expect(unknownEmail.get('Set-Cookie')).toBeUndefined();
    });

    it('runs one password verification for an unknown email too', async () => {
      const verify = vi.spyOn(app.get(PasswordHasher), 'verify');

      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@checkpoint.test', password: 'any password at all' })
        .expect(401);

      expect(verify).toHaveBeenCalledOnce();
      expect(verify.mock.calls[0]?.[1]).toMatch(/^\$argon2id\$/);
      verify.mockRestore();
    });
  });

  describe('GET /auth/me', () => {
    it('returns the caller without the password hash', async () => {
      const signed = await registerAndLogin(app);

      const response = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signed.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: signed.credentials.email,
        username: signed.credentials.username,
        role: Role.USER,
      });
    });

    it('answers 401 without a token', async () => {
      await http().get('/api/v1/auth/me').expect(401);
    });

    it('answers 404 when the account behind a still-valid token was deleted', async () => {
      const signed = await registerAndLogin(app);
      await prisma.user.delete({ where: { email: signed.credentials.email } });

      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signed.accessToken}`)
        .expect(404);
      // Deleting the user cascaded to its refresh tokens, so the session cannot be renewed.
      await refresh(app, signed.refreshCookie).expect(401);
    });

    describe('rejects with 401 a token that', () => {
      const claims = () => ({ sub: randomUUID(), role: Role.USER });
      const secret = () => config.jwtSecret;

      it.each([
        ['is not a JWT', () => Promise.resolve('not-a-token')],
        ['is sent with another scheme', () => Promise.resolve('Basic dXNlcjpwYXNz')],
        ['has expired', () => forgeToken(secret(), claims(), { expiresIn: -60 })],
        [
          'is signed with another secret',
          () => forgeToken(randomBytes(32).toString('hex'), claims()),
        ],
        ['uses alg none', () => Promise.resolve(unsignedToken(claims()))],
        ['uses another algorithm', () => forgeToken(secret(), claims(), { algorithm: 'HS512' })],
        ['has another issuer', () => forgeToken(secret(), claims(), { issuer: 'someone-else' })],
        ['has another audience', () => forgeToken(secret(), claims(), { audience: 'other-app' })],
        ['claims an unknown role', () => forgeToken(secret(), { ...claims(), role: 'ROOT' })],
        ['has no subject', () => forgeToken(secret(), { role: Role.USER })],
      ])('%s', async (_, makeToken) => {
        const token = await makeToken();
        const authorization = token.startsWith('Basic ') ? token : `Bearer ${token}`;

        const response = await http()
          .get('/api/v1/auth/me')
          .set('Authorization', authorization)
          .expect(401);

        expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      });
    });
  });

  describe('refresh and logout', () => {
    it('runs the full flow: register, login, me, refresh, logout', async () => {
      const signed = await registerAndLogin(app);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signed.accessToken}`)
        .expect(200);

      const refreshed = await refresh(app, signed.refreshCookie).expect(200);
      const newCookie = refreshCookieFrom(refreshed);
      expect(newCookie).not.toBe(signed.refreshCookie);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessTokenFrom(refreshed)}`)
        .expect(200);

      const logout = await http()
        .post('/api/v1/auth/logout')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', newCookie)
        .expect(204);
      expect(logout.get('Set-Cookie')?.[0]).toMatch(/^refresh_token=;.*Expires=Thu, 01 Jan 1970/);

      await refresh(app, newCookie).expect(401);
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const signed = await registerAndLogin(app);
      const rotated = refreshCookieFrom(await refresh(app, signed.refreshCookie).expect(200));

      const reuse = await refresh(app, signed.refreshCookie).expect(401);

      expect(reuse.body).toMatchObject({ detail: INVALID_SESSION });
      await refresh(app, rotated).expect(401);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('lets only one of two concurrent refreshes with the same token succeed', async () => {
      const signed = await registerAndLogin(app);

      const results = await Promise.all([
        refresh(app, signed.refreshCookie),
        refresh(app, signed.refreshCookie),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
      // The loser counts as reuse, so the winner's new token is revoked as well.
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('rejects an expired refresh token', async () => {
      const signed = await registerAndLogin(app);
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      await refresh(app, signed.refreshCookie).expect(401);
    });

    it.each([
      ['no cookie', undefined],
      ['an unknown token', `refresh_token=${randomBytes(32).toString('base64url')}`],
    ])('answers 401 to a refresh with %s', async (_, cookie) => {
      const call = http().post('/api/v1/auth/refresh').set('Origin', ALLOWED_ORIGIN);
      await (cookie === undefined ? call : call.set('Cookie', cookie)).expect(401);
    });

    it.each([
      ['without an Origin header', undefined],
      ['from an origin outside the allow-list', 'https://evil.example'],
    ])('answers 403 to a refresh %s and keeps the token valid', async (_, origin) => {
      const signed = await registerAndLogin(app);
      const call = http().post('/api/v1/auth/refresh').set('Cookie', signed.refreshCookie);

      await (origin === undefined ? call : call.set('Origin', origin)).expect(403);
      await refresh(app, signed.refreshCookie).expect(200);
    });

    it('answers 403 to a logout from an untrusted origin and keeps the session', async () => {
      const signed = await registerAndLogin(app);

      await http()
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://evil.example')
        .set('Cookie', signed.refreshCookie)
        .expect(403);

      await refresh(app, signed.refreshCookie).expect(200);
    });

    it('answers 204 to a logout without a session', async () => {
      await http().post('/api/v1/auth/logout').set('Origin', ALLOWED_ORIGIN).expect(204);
    });
  });

  describe('roles', () => {
    it('lets any signed-in user through an authenticated route', async () => {
      const signed = await registerAndLogin(app);

      await http()
        .get('/api/v1/probe/protected')
        .set('Authorization', `Bearer ${signed.accessToken}`)
        .expect(200);
    });

    it('answers 403 to a USER on an ADMIN route and 401 without a token', async () => {
      const signed = await registerAndLogin(app);

      await http()
        .get('/api/v1/probe/protected/admin')
        .set('Authorization', `Bearer ${signed.accessToken}`)
        .expect(403);
      await http().get('/api/v1/probe/protected/admin').expect(401);
    });

    it('applies a promotion at the next refresh', async () => {
      const signed = await registerAndLogin(app);
      await prisma.user.update({
        where: { email: signed.credentials.email },
        data: { role: Role.ADMIN },
      });

      const refreshed = await refresh(app, signed.refreshCookie).expect(200);

      await http()
        .get('/api/v1/probe/protected/admin')
        .set('Authorization', `Bearer ${accessTokenFrom(refreshed)}`)
        .expect(200);
    });
  });

  it('flags a response that exposes a password hash', async () => {
    await http().get('/api/v1/probe/leak').expect(200);

    // Taken here so the suite-wide check after this test passes.
    expect(takeLeaks()).toEqual(['GET /api/v1/probe/leak']);
  });
});
