import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { encodeCursor, INVALID_CURSOR } from '../src/common/pagination/cursor';
import { registerAndLogin, type Signed } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

const reviewSchema = z.object({
  id: z.uuid(),
  rating: z.number(),
  body: z.string(),
  author: z.object({ username: z.string() }),
});
const pageSchema = z.object({ data: z.array(reviewSchema), nextCursor: z.string().nullable() });

const BODY = 'A thoughtful review of this game.';
// Enough parallel writes to the same game that, without the row lock in ReviewsService, some
// transaction computes the average before another commits (checked by removing the lock).
const CONCURRENT_REVIEWERS = 20;

describe('reviews', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createGame(prisma, { slug: 'hades', title: 'Hades' });
    await createGame(prisma, { slug: 'celeste', title: 'Celeste' });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const put = (user: Signed, slug: string, body: object) =>
    http()
      .put(`/api/v1/games/${slug}/reviews/me`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);
  const remove = (user: Signed, slug: string) =>
    http()
      .delete(`/api/v1/games/${slug}/reviews/me`)
      .set('Authorization', `Bearer ${user.accessToken}`);

  // The stored, denormalized columns next to a fresh aggregate over the reviews table.
  async function ratingColumnsAndAggregate(slug: string) {
    const game = await prisma.game.findUniqueOrThrow({
      where: { slug },
      select: { id: true, ratingAverage: true, ratingCount: true },
    });
    const [fresh] = await prisma.$queryRaw<{ average: string; count: bigint }[]>`
      SELECT coalesce(round(avg(rating)::numeric, 2), 0)::text AS average, count(*) AS count
      FROM reviews WHERE game_id = ${game.id}::uuid`;
    return {
      stored: { average: game.ratingAverage.toFixed(2), count: game.ratingCount },
      fresh: { average: Number(fresh?.average).toFixed(2), count: Number(fresh?.count) },
    };
  }

  describe('PUT /games/:slug/reviews/me', () => {
    it('creates the caller’s review and returns it with the author', async () => {
      const ana = await registerAndLogin(app);

      const response = await put(ana, 'hades', { rating: 5, body: `  ${BODY}  ` }).expect(200);

      expect(reviewSchema.parse(response.body)).toMatchObject({
        rating: 5,
        body: BODY,
        author: { username: ana.credentials.username },
      });
    });

    it('replaces the caller’s review instead of adding a second one', async () => {
      const ana = await registerAndLogin(app);
      const first = reviewSchema.parse(
        (await put(ana, 'hades', { rating: 2, body: BODY }).expect(200)).body,
      );

      const second = reviewSchema.parse(
        (
          await put(ana, 'hades', { rating: 4, body: 'Changed my mind after the ending.' }).expect(
            200,
          )
        ).body,
      );

      expect(second.id).toBe(first.id);
      expect(second.rating).toBe(4);
      expect(await prisma.review.count()).toBe(1);
    });

    it.each([
      ['a rating of 6', { rating: 6, body: BODY }],
      ['a rating of 0', { rating: 0, body: BODY }],
      ['a fractional rating', { rating: 4.5, body: BODY }],
      ['a body of 9 characters', { rating: 4, body: 'Too short' }],
      ['a body of 2001 characters', { rating: 4, body: 'x'.repeat(2001) }],
      [
        'a userId in the body',
        { rating: 4, body: BODY, userId: '0192f0c4-7b1e-7cc0-9a51-2f6d1e0b5a10' },
      ],
    ])('rejects %s with 400', async (_, body) => {
      const ana = await registerAndLogin(app);

      await put(ana, 'hades', body).expect(400);

      expect(await prisma.review.count()).toBe(0);
    });

    it('answers 404 for an unknown game', async () => {
      const ana = await registerAndLogin(app);

      await put(ana, 'no-such-game', { rating: 4, body: BODY }).expect(404);
    });

    it('leaves exactly one review when the same user sends two PUTs at once', async () => {
      const ana = await registerAndLogin(app);

      const results = await Promise.all([
        put(ana, 'hades', { rating: 1, body: BODY }),
        put(ana, 'hades', { rating: 5, body: BODY }),
      ]);

      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(await prisma.review.count()).toBe(1);
      const { stored, fresh } = await ratingColumnsAndAggregate('hades');
      expect(stored).toEqual(fresh);
    });

    it('keeps the rating exact when many users review the same game at once', async () => {
      const users = await Promise.all(
        Array.from({ length: CONCURRENT_REVIEWERS }, () => registerAndLogin(app)),
      );

      await Promise.all(
        users.map((user, index) =>
          put(user, 'hades', { rating: (index % 5) + 1, body: BODY }).expect(200),
        ),
      );

      const { stored, fresh } = await ratingColumnsAndAggregate('hades');
      expect(stored).toEqual({ average: '3.00', count: CONCURRENT_REVIEWERS });
      expect(stored).toEqual(fresh);
    });
  });

  describe('rating aggregate', () => {
    it('matches a fresh aggregate after creates, updates and deletes by several users', async () => {
      const [ana, bruno, carla] = await Promise.all([
        registerAndLogin(app),
        registerAndLogin(app),
        registerAndLogin(app),
      ]);

      await put(ana, 'hades', { rating: 5, body: BODY }).expect(200);
      await put(bruno, 'hades', { rating: 2, body: BODY }).expect(200);
      await put(carla, 'hades', { rating: 4, body: BODY }).expect(200);
      expect((await ratingColumnsAndAggregate('hades')).stored).toEqual({
        average: '3.67',
        count: 3,
      });

      await put(bruno, 'hades', { rating: 3, body: BODY }).expect(200);
      await remove(carla, 'hades').expect(204);
      await put(carla, 'celeste', { rating: 1, body: BODY }).expect(200);

      for (const slug of ['hades', 'celeste']) {
        const { stored, fresh } = await ratingColumnsAndAggregate(slug);
        expect(stored).toEqual(fresh);
      }
      expect((await ratingColumnsAndAggregate('hades')).stored).toEqual({
        average: '4.00',
        count: 2,
      });

      const detail = await http().get('/api/v1/games/hades').expect(200);
      expect(detail.body).toMatchObject({ rating: { average: 4, count: 2 } });
    });

    it('returns to zero when the last review is deleted', async () => {
      const ana = await registerAndLogin(app);
      await put(ana, 'hades', { rating: 5, body: BODY }).expect(200);

      await remove(ana, 'hades').expect(204);

      expect((await ratingColumnsAndAggregate('hades')).stored).toEqual({
        average: '0.00',
        count: 0,
      });
    });
  });

  describe('DELETE /games/:slug/reviews/me', () => {
    it('answers 404 when the caller has no review of the game', async () => {
      const ana = await registerAndLogin(app);

      await remove(ana, 'hades').expect(404);
    });

    it('answers 404 for an unknown game', async () => {
      const ana = await registerAndLogin(app);

      await remove(ana, 'no-such-game').expect(404);
    });
  });

  describe('one user cannot touch another user’s review', () => {
    it('deleting "me" never removes someone else’s review', async () => {
      const [ana, bruno] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      await put(bruno, 'hades', { rating: 2, body: BODY }).expect(200);

      await remove(ana, 'hades').expect(404);

      expect(await prisma.review.findMany({ select: { rating: true } })).toEqual([{ rating: 2 }]);
    });

    it('writing "me" creates the caller’s own review and leaves the other one unchanged', async () => {
      const [ana, bruno] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      const brunos = reviewSchema.parse(
        (await put(bruno, 'hades', { rating: 2, body: BODY }).expect(200)).body,
      );

      const anas = reviewSchema.parse(
        (await put(ana, 'hades', { rating: 5, body: 'Different opinion entirely.' }).expect(200))
          .body,
      );

      expect(anas.id).not.toBe(brunos.id);
      expect(
        await prisma.review.findUniqueOrThrow({
          where: { id: brunos.id },
          select: { rating: true, body: true },
        }),
      ).toEqual({ rating: 2, body: BODY });
    });
  });

  describe('GET /games/:slug/reviews', () => {
    it('lists reviews newest first, every one once across pages, without emails', async () => {
      const users = [];
      for (let index = 0; index < 5; index += 1) {
        const user = await registerAndLogin(app);
        await put(user, 'hades', { rating: 3, body: `${BODY} Number ${String(index)}.` }).expect(
          200,
        );
        users.push(user);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const response = await http()
          .get('/api/v1/games/hades/reviews')
          .query(cursor === null ? { limit: 2 } : { limit: 2, cursor })
          .expect(200);
        expect(response.text).not.toContain('@checkpoint.test');
        const page = pageSchema.parse(response.body);
        seen.push(...page.data.map((review) => review.author.username));
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(seen).toEqual(users.map((user) => user.credentials.username).reverse());
    });

    it('answers 404 for an unknown game', async () => {
      await http().get('/api/v1/games/no-such-game/reviews').expect(404);
    });

    it('rejects an invalid cursor with 400', async () => {
      const response = await http()
        .get('/api/v1/games/hades/reviews')
        .query({ cursor: encodeCursor({ createdAt: 'yesterday', id: 'x' }) })
        .expect(400);

      expect(response.body).toMatchObject({ detail: INVALID_CURSOR });
    });
  });
});
