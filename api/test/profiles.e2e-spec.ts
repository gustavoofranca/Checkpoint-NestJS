import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROFILE_REVIEW_COUNT } from '../src/modules/users/users.service';
import { registerAndLogin } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

const profileSchema = z.strictObject({
  username: z.string(),
  joinedAt: z.iso.datetime(),
  reviewCount: z.number(),
  latestReviews: z.array(
    z.strictObject({
      game: z.strictObject({ slug: z.string(), title: z.string() }),
      rating: z.number(),
      body: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});

describe('GET /users/:username', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('shows the username, join date, review count and latest reviews, and never the email', async () => {
    const ana = await registerAndLogin(app);
    for (let index = 0; index < PROFILE_REVIEW_COUNT + 2; index += 1) {
      await createGame(prisma, { slug: `game-${String(index)}`, title: `Game ${String(index)}` });
      await request(app.getHttpServer())
        .put(`/api/v1/games/game-${String(index)}/reviews/me`)
        .set('Authorization', `Bearer ${ana.accessToken}`)
        .send({ rating: 4, body: `Review number ${String(index)} of the series.` })
        .expect(200);
    }

    const response = await http().get(`/api/v1/users/${ana.credentials.username}`).expect(200);

    // strictObject: any extra field (email, role, id) fails the parse.
    const profile = profileSchema.parse(response.body);
    expect(profile.username).toBe(ana.credentials.username);
    expect(profile.reviewCount).toBe(PROFILE_REVIEW_COUNT + 2);
    expect(profile.latestReviews.map((review) => review.game.slug)).toEqual([
      'game-6',
      'game-5',
      'game-4',
      'game-3',
      'game-2',
    ]);
    expect(response.text).not.toContain(ana.credentials.email);
  });

  it('shows an empty list for a user without reviews', async () => {
    const ana = await registerAndLogin(app);

    const profile = profileSchema.parse(
      (await http().get(`/api/v1/users/${ana.credentials.username}`).expect(200)).body,
    );

    expect(profile).toMatchObject({ reviewCount: 0, latestReviews: [] });
  });

  it('answers 404 for an unknown username and 400 for an invalid one', async () => {
    await http().get('/api/v1/users/nobody_here').expect(404);
    await http().get('/api/v1/users/Not A Name').expect(400);
  });
});
