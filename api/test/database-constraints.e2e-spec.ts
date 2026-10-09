import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createGame,
  createTestPrismaClient,
  createUser,
  resetDatabase,
  violatedConstraint,
} from './support/database';

// These writes go through Prisma Client, which forwards them unchanged: every rejection below
// comes from PostgreSQL, named by the constraint that fired.
describe('database constraints', () => {
  const prisma = createTestPrismaClient();

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('users', () => {
    it('rejects a duplicate email', async () => {
      await createUser(prisma, { email: 'ana@checkpoint.test' });

      expect(await violatedConstraint(createUser(prisma, { email: 'ana@checkpoint.test' }))).toBe(
        'users_email_key',
      );
    });

    it('rejects an email that is not lowercase', async () => {
      expect(await violatedConstraint(createUser(prisma, { email: 'Ana@checkpoint.test' }))).toBe(
        'users_email_lowercase_check',
      );
    });

    it('rejects a duplicate username', async () => {
      await createUser(prisma, { username: 'ana' });

      expect(await violatedConstraint(createUser(prisma, { username: 'ana' }))).toBe(
        'users_username_key',
      );
    });

    it.each(['Ana', 'ana smith', 'an', 'ana-smith'])(
      'rejects the username %j',
      async (username) => {
        expect(await violatedConstraint(createUser(prisma, { username }))).toBe(
          'users_username_format_check',
        );
      },
    );

    it('generates UUID v7 ids that start with the creation time', async () => {
      const before = Date.now();
      const user = await createUser(prisma);
      const after = Date.now();

      expect(user.id[14]).toBe('7');
      const timestamp = Number.parseInt(user.id.replace(/-/g, '').slice(0, 12), 16);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('reviews', () => {
    async function writeReview(rating: number, body = 'A fair review of the game.') {
      const user = await createUser(prisma);
      const game = await createGame(prisma);
      return prisma.review.create({ data: { userId: user.id, gameId: game.id, rating, body } });
    }

    it.each([0, 6, -1])('rejects a rating of %i', async (rating) => {
      expect(await violatedConstraint(writeReview(rating))).toBe('reviews_rating_check');
    });

    it.each([1, 5])('accepts a rating of %i', async (rating) => {
      await expect(writeReview(rating)).resolves.toMatchObject({ rating });
    });

    it('rejects a second review of the same game by the same user', async () => {
      const user = await createUser(prisma);
      const game = await createGame(prisma);
      const review = { userId: user.id, gameId: game.id, rating: 4, body: 'Liked it a lot.' };
      await prisma.review.create({ data: review });

      expect(await violatedConstraint(prisma.review.create({ data: review }))).toBe(
        'reviews_user_id_game_id_key',
      );
    });

    it.each([
      ['9 characters', 'x'.repeat(9)],
      ['2001 characters', 'x'.repeat(2001)],
    ])('rejects a body of %s', async (_, body) => {
      expect(await violatedConstraint(writeReview(3, body))).toBe('reviews_body_length_check');
    });

    it.each([10, 2000])('accepts a body of %i characters', async (length) => {
      await expect(writeReview(3, 'x'.repeat(length))).resolves.toBeDefined();
    });

    it('deletes a user’s reviews together with the user', async () => {
      const user = await createUser(prisma);
      const game = await createGame(prisma);
      await prisma.review.create({
        data: { userId: user.id, gameId: game.id, rating: 4, body: 'Liked it a lot.' },
      });

      await prisma.user.delete({ where: { id: user.id } });

      expect(await prisma.review.count({ where: { gameId: game.id } })).toBe(0);
    });
  });

  describe('games', () => {
    it('rejects a duplicate Steam app id', async () => {
      await createGame(prisma, { steamAppId: 1145360 });

      expect(await violatedConstraint(createGame(prisma, { steamAppId: 1145360 }))).toBe(
        'games_steam_app_id_key',
      );
    });

    it.each(['Hades', 'hades ii', '-hades', 'hades-', 'hades--ii'])(
      'rejects the slug %j',
      async (slug) => {
        expect(await violatedConstraint(createGame(prisma, { slug }))).toBe(
          'games_slug_format_check',
        );
      },
    );

    it('rejects a price without a currency', async () => {
      expect(await violatedConstraint(createGame(prisma, { currency: null }))).toBe(
        'games_price_currency_pair_check',
      );
    });

    it('rejects a negative price', async () => {
      expect(await violatedConstraint(createGame(prisma, { priceCents: -1 }))).toBe(
        'games_price_cents_check',
      );
    });

    it('rejects a lowercase currency code', async () => {
      expect(await violatedConstraint(createGame(prisma, { currency: 'usd' }))).toBe(
        'games_currency_format_check',
      );
    });

    it('rejects an average above 5', async () => {
      expect(
        await violatedConstraint(createGame(prisma, { ratingAverage: 5.5, ratingCount: 2 })),
      ).toBe('games_rating_average_check');
    });

    it('rejects an average without any rating behind it', async () => {
      expect(
        await violatedConstraint(createGame(prisma, { ratingAverage: 3, ratingCount: 0 })),
      ).toBe('games_unrated_average_check');
    });

    it('accepts a free game with no price', async () => {
      await expect(
        createGame(prisma, { isFree: true, priceCents: null, currency: null }),
      ).resolves.toBeDefined();
    });
  });
});
