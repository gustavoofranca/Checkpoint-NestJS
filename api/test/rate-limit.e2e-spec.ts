import { setTimeout as sleep } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisThrottlerStorage } from '../src/rate-limit/redis-throttler.storage';
import { newCredentials } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { ALLOWED_ORIGIN, liveDependencies, testConfig } from './support/test-config';

const login = (app: NestExpressApplication, email: string, forwardedFor?: string) => {
  const call = request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'not the right password' });
  return forwardedFor === undefined ? call : call.set('X-Forwarded-For', forwardedFor);
};

describe('rate limiting', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('answers the 6th failed login for one account with 429 and Retry-After', async () => {
    const { email } = newCredentials();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(app, email).expect(401);
    }

    const blocked = await login(app, email).expect(429);

    expect(blocked.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(blocked.body).toMatchObject({ status: 429, title: 'Too Many Requests' });
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('limits one account without affecting another', async () => {
    const blocked = newCredentials().email;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await login(app, blocked);
    }

    await login(app, newCredentials().email).expect(401);
  });

  it('counts the account limit across case and spacing variants of the email', async () => {
    const { email } = newCredentials();
    for (const variant of [email, email.toUpperCase(), ` ${email} `, email, email]) {
      await login(app, variant).expect(401);
    }

    await login(app, email).expect(429);
  });

  it('answers the 31st credential request from one IP with 429, whatever the accounts', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await login(app, newCredentials().email).expect(401);
    }

    await login(app, newCredentials().email).expect(429);
  });

  it('ignores X-Forwarded-For when no proxy is trusted, so a client cannot reset its IP', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await login(app, newCredentials().email, `203.0.113.${String(attempt)}`).expect(401);
    }

    await login(app, newCredentials().email, '198.51.100.7').expect(429);
  });

  it('limits refresh per IP too', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', ALLOWED_ORIGIN)
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .expect(429);
  });

  it('applies the global limit of 300 requests a minute to every route', async () => {
    for (let attempt = 1; attempt <= 300; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    }

    const blocked = await request(app.getHttpServer()).get('/api/v1/health/live').expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('rate limiting behind one trusted proxy', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      config: testConfig({ ...liveDependencies(), TRUST_PROXY_HOPS: '1' }),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps counting one account across client IPs', async () => {
    const { email } = newCredentials();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(app, email, `203.0.113.${String(attempt)}`).expect(401);
    }

    await login(app, email, '198.51.100.7').expect(429);
  });

  it('counts each client IP separately', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await login(app, newCredentials().email, '203.0.113.10').expect(401);
    }

    await login(app, newCredentials().email, '203.0.113.10').expect(429);
    await login(app, newCredentials().email, '203.0.113.11').expect(401);
  });
});

describe('rate limiting with Redis unreachable', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      config: testConfig({ DATABASE_URL: liveDependencies().DATABASE_URL }),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('fails closed on credential routes: 503, not an unlimited login', async () => {
    const response = await login(app, newCredentials().email).expect(503);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('fails open elsewhere: the catalog keeps answering', async () => {
    await request(app.getHttpServer()).get('/api/v1/games').expect(200);
  });
});

describe('RedisThrottlerStorage', () => {
  const redis = new Redis(liveDependencies().REDIS_URL);
  const storage = new RedisThrottlerStorage(redis, new Set());

  afterAll(() => {
    redis.disconnect();
  });

  it('counts hits, blocks past the limit and releases the block when it expires', async () => {
    const key = `storage-test-${String(Date.now())}`;

    expect(await storage.increment(key, 1000, 2, 1000, 'default')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await storage.increment(key, 1000, 2, 1000, 'default');
    const blocked = await storage.increment(key, 1000, 2, 1000, 'default');
    expect(blocked).toMatchObject({ totalHits: 3, isBlocked: true, timeToBlockExpire: 1 });

    // While blocked, requests are not counted.
    expect(await storage.increment(key, 1000, 2, 1000, 'default')).toMatchObject({ totalHits: 3 });

    await sleep(1100);
    expect(await storage.increment(key, 1000, 2, 1000, 'default')).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});
