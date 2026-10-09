import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SNAPSHOT_FILE } from '../src/cli/data-files';
import { type CatalogSnapshot, catalogSnapshotSchema } from '../src/modules/sync/catalog-game';
import { PasswordHasher } from '../src/modules/users/password-hasher';
import { DEMO_USERS, seedDatabase } from '../src/prisma/seed-database';
import { createTestPrismaClient, resetDatabase } from './support/database';

describe('seedDatabase with the bundled snapshot', () => {
  const prisma = createTestPrismaClient();
  const hasher = new PasswordHasher();
  const demoPassword = randomBytes(16).toString('hex');
  let snapshot: CatalogSnapshot;
  let demoPasswordHash: string;

  beforeAll(async () => {
    // Parsing it here also proves the committed snapshot passes the seed's validation.
    snapshot = catalogSnapshotSchema.parse(JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')));
    demoPasswordHash = await hasher.hash(demoPassword);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function rowCounts() {
    return {
      games: await prisma.game.count(),
      genres: await prisma.genre.count(),
      gameGenres: await prisma.gameGenre.count(),
      users: await prisma.user.count(),
    };
  }

  it('bundles about 200 games', () => {
    expect(snapshot.games.length).toBeGreaterThanOrEqual(180);
  });

  it('loads every game, genre and demo user', async () => {
    const report = await seedDatabase(prisma, snapshot, demoPasswordHash);

    expect(report.games).toBe(snapshot.games.length);
    expect(report.demoUsersCreated).toBe(DEMO_USERS.length);
    expect(await rowCounts()).toEqual({
      games: snapshot.games.length,
      genres: new Set(snapshot.games.flatMap((game) => game.genres)).size,
      gameGenres: snapshot.games.reduce((total, game) => total + game.genres.length, 0),
      users: DEMO_USERS.length,
    });
  });

  it('leaves the same row counts when run twice', async () => {
    await seedDatabase(prisma, snapshot, demoPasswordHash);
    const afterFirst = await rowCounts();

    const second = await seedDatabase(prisma, snapshot, demoPasswordHash);

    expect(second.demoUsersCreated).toBe(0);
    expect(await rowCounts()).toEqual(afterFirst);
  });

  it('keeps ratings and slugs on a re-run while refreshing catalog fields', async () => {
    await seedDatabase(prisma, snapshot, demoPasswordHash);
    const [first] = snapshot.games;
    if (first === undefined) {
      throw new Error('snapshot is empty');
    }
    const before = await prisma.game.update({
      where: { steamAppId: first.steamAppId },
      data: { ratingAverage: 4.5, ratingCount: 2 },
      select: { slug: true },
    });
    const renamed: CatalogSnapshot = {
      ...snapshot,
      games: snapshot.games.map((game) =>
        game.steamAppId === first.steamAppId ? { ...game, title: 'Renamed On Steam' } : game,
      ),
    };

    await seedDatabase(prisma, renamed, demoPasswordHash);

    const after = await prisma.game.findUniqueOrThrow({
      where: { steamAppId: first.steamAppId },
      select: { slug: true, title: true, ratingAverage: true, ratingCount: true },
    });
    expect(after.title).toBe('Renamed On Steam');
    expect(after.slug).toBe(before.slug);
    expect(after.ratingAverage.toString()).toBe('4.5');
    expect(after.ratingCount).toBe(2);
  });

  it('creates demo users who can sign in with the configured password', async () => {
    await seedDatabase(prisma, snapshot, demoPasswordHash);

    const users = await prisma.user.findMany({ select: { email: true, passwordHash: true } });

    expect(users.map((user) => user.email).sort()).toEqual(
      DEMO_USERS.map((user) => user.email).sort(),
    );
    for (const user of users) {
      expect(await hasher.verify(demoPassword, user.passwordHash)).toBe(true);
    }
  });
});
