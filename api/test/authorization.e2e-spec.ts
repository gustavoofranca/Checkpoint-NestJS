import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
