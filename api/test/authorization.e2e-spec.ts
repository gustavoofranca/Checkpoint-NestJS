import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../src/config/app-config';
import { Role } from '../src/generated/prisma/client';
import { forgeToken } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

type Method = 'get' | 'post' | 'put' | 'delete';

// Every route that needs an access token. A new protected route belongs here: the matrix in
// api/test/README.md points at this table (docs/SECURITY.md section 1).
const PROTECTED_ROUTES: { method: Method; path: (slug: string, gameId: string) => string }[] = [
  { method: 'get', path: () => '/api/v1/auth/me' },
  { method: 'put', path: (slug) => `/api/v1/games/${slug}/reviews/me` },
  { method: 'delete', path: (slug) => `/api/v1/games/${slug}/reviews/me` },
  { method: 'get', path: () => '/api/v1/me/library' },
  { method: 'put', path: (_, gameId) => `/api/v1/me/library/${gameId}` },
  { method: 'delete', path: (_, gameId) => `/api/v1/me/library/${gameId}` },
  { method: 'post', path: () => '/api/v1/admin/sync' },
  { method: 'get', path: () => '/api/v1/admin/sync/runs' },
];

// Every other route: open to anonymous callers, or protected by something other than an access
// token (the refresh cookie, METRICS_TOKEN). api/test/README.md lists them and why.
const OTHER_ROUTES = [
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/games',
  'GET /api/v1/games/{slug}',
  'GET /api/v1/genres',
  'GET /api/v1/games/{slug}/reviews',
  'GET /api/v1/users/{username}',
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/metrics',
];

const openApiDocument = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({ security: z.array(z.record(z.string(), z.unknown())).optional() }),
    ),
  ),
});

describe('authorization matrix: every protected route', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  let config: AppConfig;
  let slug: string;
  let gameId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const game = await createGame(prisma, { slug: 'matrix-game' });
    slug = 'matrix-game';
    gameId = game.id;
    config = testConfig(liveDependencies());
    app = await createTestApp({ config });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // A route added without a place in one of the two lists fails here, so the matrix below cannot
  // silently miss it.
  it('lists every route of the API, and exactly those that require an access token', async () => {
    const document = openApiDocument.parse(
      (await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200)).body,
    );
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        route: `${method.toUpperCase()} ${path}`,
        bearer: operation.security?.some((scheme) => 'bearer' in scheme) === true,
      })),
    );

    expect(
      operations
        .filter((operation) => operation.bearer)
        .map((o) => o.route)
        .sort(),
    ).toEqual(
      PROTECTED_ROUTES.map(
        (route) => `${route.method.toUpperCase()} ${route.path('{slug}', '{gameId}')}`,
      ).sort(),
    );
    expect(
      operations
        .filter((operation) => !operation.bearer)
        .map((o) => o.route)
        .sort(),
    ).toEqual([...OTHER_ROUTES].sort());
  });

  const call = (route: (typeof PROTECTED_ROUTES)[number]) =>
    request(app.getHttpServer())[route.method](route.path(slug, gameId));

  describe.each(
    PROTECTED_ROUTES.map(
      (route) =>
        [`${route.method.toUpperCase()} ${route.path(':slug', ':gameId')}`, route] as const,
    ),
  )('%s', (_, route) => {
    it('answers 401 without a token', async () => {
      await call(route).send({}).expect(401);
    });

    it('answers 401 with a malformed token', async () => {
      await call(route).set('Authorization', 'Bearer not.a.jwt').send({}).expect(401);
    });

    it('answers 401 with an expired token', async () => {
      const token = await forgeToken(
        config.jwtSecret,
        { sub: randomUUID(), role: Role.USER },
        { expiresIn: -60 },
      );

      const response = await call(route)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(401);

      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    });
  });
});
