import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CacheService } from '../src/redis/cache.service';
import { registerAndLogin } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import {
  createQueryCountingPrisma,
  type QueryCountingPrisma,
} from './support/query-counting-prisma';
import { liveDependencies, testConfig } from './support/test-config';

describe('catalog cache', () => {
  const prisma = createTestPrismaClient();
  let counting: QueryCountingPrisma;
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    counting = createQueryCountingPrisma(liveDependencies().DATABASE_URL);
    app = await createTestApp({ config: testConfig(liveDependencies()), prisma: counting.client });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createGame(prisma, { slug: 'hades', title: 'Hades' });
    await createGame(prisma, { slug: 'celeste', title: 'Celeste' });
  });

  afterAll(async () => {
    await app.close();
    await counting.client.$disconnect();
    await prisma.$disconnect();
  });

  const stats = () => app.get(CacheService).stats();

  it('serves a second identical list request from the cache, without touching the database', async () => {
    const before = stats();
    const first = await http().get('/api/v1/games').query({ sort: 'title' }).expect(200);
    counting.statements.length = 0;

    const second = await http().get('/api/v1/games').query({ sort: 'title' }).expect(200);

    expect(second.body).toEqual(first.body);
    expect(counting.statements).toEqual([]);
    expect(stats()).toEqual({ hits: before.hits + 1, misses: before.misses + 1 });
  });

  it('keys the cache by query: a different filter is a miss', async () => {
    await http().get('/api/v1/games').query({ q: 'hades' }).expect(200);
    const misses = stats().misses;

    const other = await http().get('/api/v1/games').query({ q: 'celeste' }).expect(200);

    expect(stats().misses).toBe(misses + 1);
    expect(other.body).toMatchObject({ data: [{ slug: 'celeste' }] });
  });

  it('shares one entry between searches that differ only in case', async () => {
    await http().get('/api/v1/games').query({ q: 'Hades' }).expect(200);
    const hits = stats().hits;

    await http().get('/api/v1/games').query({ q: 'HADES' }).expect(200);

    expect(stats().hits).toBe(hits + 1);
  });

  it('shows a new rating right after a review write, in the detail and in the list', async () => {
    await http()
      .get('/api/v1/games/hades')
      .expect(200, /"count":0/);
    await http().get('/api/v1/games').query({ sort: 'top_rated' }).expect(200);
    const ana = await registerAndLogin(app);

    await http()
      .put('/api/v1/games/hades/reviews/me')
      .set('Authorization', `Bearer ${ana.accessToken}`)
      .send({ rating: 4, body: 'Cached pages must not hide this review.' })
      .expect(200);

    const detail = await http().get('/api/v1/games/hades').expect(200);
    expect(detail.body).toMatchObject({ rating: { average: 4, count: 1 } });
    const list = await http().get('/api/v1/games').query({ sort: 'top_rated' }).expect(200);
    // Hades now leads top_rated; the cached order had both games at 0.
    expect(list.body).toMatchObject({
      data: [
        { slug: 'hades', rating: { average: 4, count: 1 } },
        { slug: 'celeste', rating: { average: 0, count: 0 } },
      ],
    });
  });

  it('does not cache a 404', async () => {
    await http().get('/api/v1/games/portal').expect(404);
    await createGame(prisma, { slug: 'portal', title: 'Portal' });

    await http().get('/api/v1/games/portal').expect(200);
  });
});

describe('catalog with Redis unreachable', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await createGame(prisma, { slug: 'hades', title: 'Hades' });
    // Live PostgreSQL; REDIS_URL keeps the test default, a port where nothing listens.
    app = await createTestApp({
      config: testConfig({ DATABASE_URL: liveDependencies().DATABASE_URL }),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it.each(['/api/v1/games', '/api/v1/games/hades', '/api/v1/genres'])(
    'still answers GET %s with 200, quickly',
    async (path) => {
      const started = Date.now();

      await request(app.getHttpServer()).get(path).expect(200);

      expect(Date.now() - started).toBeLessThan(1000);
    },
  );
});
