import { readFile } from 'node:fs/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SNAPSHOT_FILE } from '../src/cli/data-files';
import { encodeCursor, INVALID_CURSOR } from '../src/common/pagination/cursor';
import { catalogSnapshotSchema } from '../src/modules/sync/catalog-game';
import { seedDatabase } from '../src/prisma/seed-database';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { createQueryCountingPrisma } from './support/query-counting-prisma';
import { liveDependencies, testConfig } from './support/test-config';

const summarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  releaseDate: z.iso.date().nullable(),
  rating: z.object({ average: z.number(), count: z.number() }),
  genres: z.array(z.object({ slug: z.string(), name: z.string() })),
});
const pageSchema = z.object({ data: z.array(summarySchema), nextCursor: z.string().nullable() });

interface OrderRow {
  id: string;
  slug: string;
  releaseDate: Date | null;
  ratingAverage: number;
  titleSort: string;
}

// The expected orders, computed here independently of the queries under test.
const byId = (a: OrderRow, b: OrderRow) => (a.id < b.id ? -1 : 1);
const EXPECTED_ORDER = {
  newest: (a: OrderRow, b: OrderRow) => {
    if (a.releaseDate === null || b.releaseDate === null) {
      if (a.releaseDate !== b.releaseDate) {
        return a.releaseDate === null ? -1 : 1;
      }
      return -byId(a, b);
    }
    return b.releaseDate.getTime() - a.releaseDate.getTime() || -byId(a, b);
  },
  top_rated: (a: OrderRow, b: OrderRow) => b.ratingAverage - a.ratingAverage || -byId(a, b),
  // Byte order, as the "C" collation of title_sort.
  title: (a: OrderRow, b: OrderRow) =>
    Buffer.compare(Buffer.from(a.titleSort), Buffer.from(b.titleSort)) || byId(a, b),
};

describe('catalog', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase(prisma);
    const snapshot = catalogSnapshotSchema.parse(JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')));
    await seedDatabase(prisma, snapshot, 'not-a-hash-no-one-signs-in');

    // Ties and gaps, so every tie-breaker in the sorts is exercised.
    const ids = (
      await prisma.game.findMany({ select: { id: true }, orderBy: { steamAppId: 'asc' } })
    ).map((game) => game.id);
    const ratings = [4.5, 3.25, 4.5, 2, 5, 4.5];
    for (const [index, id] of ids.slice(0, 30).entries()) {
      const ratingAverage = ratings[index % ratings.length];
      if (ratingAverage === undefined) {
        throw new Error('rating index out of range');
      }
      await prisma.game.update({ where: { id }, data: { ratingAverage, ratingCount: index + 1 } });
    }
    await prisma.game.updateMany({
      where: { id: { in: ids.slice(30, 34) } },
      data: { releaseDate: null },
    });
    await prisma.game.updateMany({
      where: { id: { in: ids.slice(34, 38) } },
      data: { releaseDate: new Date('2020-09-17T00:00:00Z') },
    });
    // Titles with LIKE wildcards and a quote, for the search tests.
    for (const title of [
      'Patch 100% Off',
      'Patch 1000 Off',
      'Snake_Case Story',
      'SnakeXCase Story',
      "Ana's Quest",
    ]) {
      await createGame(prisma, { title });
    }

    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function listPage(query: Record<string, string | number>) {
    const response = await http().get('/api/v1/games').query(query).expect(200);
    return pageSchema.parse(response.body);
  }

  async function pageThrough(query: Record<string, string | number>): Promise<string[]> {
    const slugs: string[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 100; pages += 1) {
      const page = await listPage(cursor === null ? query : { ...query, cursor });
      slugs.push(...page.data.map((game) => game.slug));
      cursor = page.nextCursor;
      if (cursor === null) {
        return slugs;
      }
    }
    throw new Error('pagination did not end');
  }

  async function expectedSlugs(
    sort: keyof typeof EXPECTED_ORDER,
    where: Parameters<typeof prisma.game.findMany>[0] = {},
  ): Promise<string[]> {
    const rows = await prisma.game.findMany({
      ...where,
      select: { id: true, slug: true, releaseDate: true, ratingAverage: true, titleSort: true },
    });
    return rows
      .map((row) => ({ ...row, ratingAverage: row.ratingAverage.toNumber() }))
      .sort(EXPECTED_ORDER[sort])
      .map((row) => row.slug);
  }

  describe('GET /games pagination', () => {
    it.each(['newest', 'top_rated', 'title'] as const)(
      'pages through the whole catalog 7 at a time, every game once and in order (%s)',
      async (sort) => {
        const slugs = await pageThrough({ sort, limit: 7 });

        expect(slugs).toEqual(await expectedSlugs(sort));
        expect(new Set(slugs).size).toBe(slugs.length);
      },
    );

    it('pages through one genre, every game of it once', async () => {
      const slugs = await pageThrough({ genre: 'action', sort: 'title', limit: 7 });

      expect(slugs).toEqual(
        await expectedSlugs('title', {
          where: { genres: { some: { genre: { slug: 'action' } } } },
        }),
      );
      expect(slugs.length).toBeGreaterThan(7);
    });

    it('lists games without a release date first under newest', async () => {
      const page = await listPage({ sort: 'newest', limit: 5 });

      expect(page.data.slice(0, 4).every((game) => game.releaseDate === null)).toBe(true);
    });

    it('defaults to 20 items sorted by newest', async () => {
      const page = await listPage({});

      expect(page.data).toHaveLength(20);
      expect(page.data.map((game) => game.slug)).toEqual(
        (await expectedSlugs('newest')).slice(0, 20),
      );
    });

    it('ends with a null cursor on the last page', async () => {
      const page = await listPage({ limit: 50, q: 'patch' });

      expect(page.data).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('GET /games search', () => {
    it('matches anywhere in the title, ignoring case', async () => {
      const page = await listPage({ q: 'WITCHER', sort: 'title' });

      // Titles as Steam publishes them in the bundled snapshot.
      expect(page.data.map((game) => game.title)).toEqual([
        'The Witcher 2: Assassins of Kings Enhanced Edition',
        'The Witcher 3: Wild Hunt — Remastered',
      ]);
    });

    it.each([
      ['%', '100%', ['Patch 100% Off']],
      ['_', 'e_c', ['Snake_Case Story']],
      ['a quote', "Ana's", ["Ana's Quest"]],
    ])('treats %s literally', async (_, q, titles) => {
      const page = await listPage({ q });

      expect(page.data.map((game) => game.title)).toEqual(titles);
    });
  });

  describe('GET /games validation', () => {
    it.each([
      ['limit=0', { limit: 0 }],
      ['limit=51', { limit: 51 }],
      ['a non-numeric limit', { limit: 'ten' }],
      ['a one-character q', { q: 'a' }],
      ['a 65-character q', { q: 'x'.repeat(65) }],
      ['an unknown sort', { sort: 'popular' }],
      ['a genre that is not a slug', { genre: 'Action Games' }],
      ['an offset parameter', { offset: 20 }],
    ])('rejects %s with 400', async (_, query) => {
      const response = await http().get('/api/v1/games').query(query).expect(400);

      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    });

    it.each([
      ['garbage', 'not-a-cursor'],
      ['a forged shape', encodeCursor({ sort: 'title', titleSort: 42, id: 'x' })],
      [
        'a cursor from another sort',
        encodeCursor({
          sort: 'top_rated',
          ratingAverage: '4.50',
          id: '0192f0c4-7b1e-7cc0-9a51-2f6d1e0b5a10',
        }),
      ],
    ])('rejects %s as cursor with 400', async (_, cursor) => {
      const response = await http()
        .get('/api/v1/games')
        .query({ sort: 'title', cursor })
        .expect(400);

      expect(response.body).toMatchObject({ detail: INVALID_CURSOR });
    });
  });

  it('runs the same small number of queries for any page size', async () => {
    const counting = createQueryCountingPrisma(liveDependencies().DATABASE_URL);
    const countingApp = await createTestApp({
      config: testConfig(liveDependencies()),
      prisma: counting.client,
    });
    const statementsFor = async (limit: number) => {
      counting.statements.length = 0;
      await request(countingApp.getHttpServer()).get('/api/v1/games').query({ limit }).expect(200);
      return counting.statements.length;
    };

    const small = await statementsFor(5);
    const large = await statementsFor(50);

    await countingApp.close();
    await counting.client.$disconnect();
    expect(small).toBe(large);
    expect(large).toBeLessThanOrEqual(3);
  });

  describe('GET /games/:slug', () => {
    it('returns the game with genres, price and rating summary', async () => {
      const response = await http().get('/api/v1/games/hades').expect(200);

      expect(response.body).toMatchObject({
        slug: 'hades',
        title: 'Hades',
        releaseDate: '2020-09-17',
        developers: ['Supergiant Games'],
        isFree: false,
        price: { amountCents: 2499, currency: 'USD' },
        rating: { average: expect.any(Number) as unknown, count: expect.any(Number) as unknown },
        genres: [
          { slug: 'action', name: 'Action' },
          { slug: 'indie', name: 'Indie' },
          { slug: 'rpg', name: 'RPG' },
        ],
      });
    });

    it('answers 404 for an unknown slug', async () => {
      await http().get('/api/v1/games/no-such-game').expect(404);
    });

    it('answers 400 for a slug with invalid characters', async () => {
      await http().get('/api/v1/games/Hades!').expect(400);
    });
  });

  describe('GET /genres', () => {
    it('lists every genre by name with its number of games', async () => {
      const response = await http().get('/api/v1/genres').expect(200);
      const genres = z
        .object({
          data: z.array(z.object({ slug: z.string(), name: z.string(), gameCount: z.number() })),
        })
        .parse(response.body).data;

      const expected = await prisma.genre.findMany({
        select: { slug: true, name: true, _count: { select: { games: true } } },
        orderBy: { name: 'asc' },
      });
      expect(genres).toEqual(
        expected.map((genre) => ({
          slug: genre.slug,
          name: genre.name,
          gameCount: genre._count.games,
        })),
      );
    });
  });

  describe('OpenAPI', () => {
    it('serves the document with every catalog route', async () => {
      const response = await http().get('/api/v1/docs/openapi.json').expect(200);
      const document = z.object({ paths: z.record(z.string(), z.unknown()) }).parse(response.body);

      const paths = Object.keys(document.paths);
      for (const path of ['/api/v1/games', '/api/v1/games/{slug}', '/api/v1/genres']) {
        expect(paths).toContain(path);
      }
    });

    it.each([
      ['in production by default', 'false', 404],
      ['in production when ENABLE_DOCS is true', 'true', 200],
    ])('is %s answered with %i', async (_, enableDocs, status) => {
      const productionApp = await createTestApp({
        config: testConfig({ NODE_ENV: 'production', ENABLE_DOCS: enableDocs }),
      });

      await request(productionApp.getHttpServer()).get('/api/v1/docs/openapi.json').expect(status);
      await productionApp.close();
    });
  });
});
