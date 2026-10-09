import { slugify } from '../common/text/slugify';
import type { PrismaClient } from '../generated/prisma/client';
import type { CatalogGame, CatalogSnapshot } from '../modules/sync/catalog-game';

// Fixed, obviously fake accounts on the reserved .test domain. Their password comes from the
// environment, so none is committed.
export const DEMO_USERS = [
  { email: 'ana@checkpoint.test', username: 'demo_ana' },
  { email: 'bruno@checkpoint.test', username: 'demo_bruno' },
] as const;

export interface SeedReport {
  games: number;
  genres: number;
  demoUsersCreated: number;
}

// Deterministic: the lowest app id keeps the plain slug, later ones get their app id appended.
export function assignSlugs(games: readonly CatalogGame[]): Map<number, string> {
  const slugs = new Map<number, string>();
  const taken = new Set<string>();
  for (const game of [...games].sort((a, b) => a.steamAppId - b.steamAppId)) {
    const base = slugify(game.title) || `app-${String(game.steamAppId)}`;
    const slug = taken.has(base) ? `${base}-${String(game.steamAppId)}` : base;
    taken.add(slug);
    slugs.set(game.steamAppId, slug);
  }
  return slugs;
}

function genreSlug(name: string): string {
  const slug = slugify(name);
  if (slug === '') {
    throw new Error(`Genre "${name}" has no usable slug`);
  }
  return slug;
}

async function upsertGenres(
  prisma: PrismaClient,
  games: readonly CatalogGame[],
): Promise<Map<string, string>> {
  const names = [...new Set(games.flatMap((game) => game.genres))];
  const ids = new Map<string, string>();
  for (const name of names) {
    const genre = await prisma.genre.upsert({
      where: { name },
      create: { name, slug: genreSlug(name) },
      update: {},
      select: { id: true },
    });
    ids.set(name, genre.id);
  }
  return ids;
}

function catalogFields(game: CatalogGame) {
  return {
    title: game.title,
    shortDescription: game.shortDescription,
    headerImageUrl: game.headerImageUrl,
    releaseDate: game.releaseDate === null ? null : new Date(`${game.releaseDate}T00:00:00Z`),
    developers: game.developers,
    publishers: game.publishers,
    isFree: game.isFree,
    priceCents: game.priceCents,
    currency: game.currency,
  };
}

// Idempotent: games are upserted by Steam app id, genres by name, demo users only when missing.
// A re-run refreshes catalog fields but keeps slugs (they are URLs) and ratings (they come from
// reviews, not from Steam).
export async function seedDatabase(
  prisma: PrismaClient,
  snapshot: CatalogSnapshot,
  demoPasswordHash: string,
): Promise<SeedReport> {
  const syncedAt = new Date(snapshot.fetchedAt);
  const slugs = assignSlugs(snapshot.games);
  const genreIds = await upsertGenres(prisma, snapshot.games);

  for (const game of snapshot.games) {
    const slug = slugs.get(game.steamAppId);
    if (slug === undefined) {
      throw new Error(`No slug assigned to app ${String(game.steamAppId)}`);
    }
    const genreLinks = game.genres.map((name) => {
      const genreId = genreIds.get(name);
      if (genreId === undefined) {
        throw new Error(`Genre "${name}" was not upserted`);
      }
      return genreId;
    });

    await prisma.$transaction(async (tx) => {
      const saved = await tx.game.upsert({
        where: { steamAppId: game.steamAppId },
        create: { steamAppId: game.steamAppId, slug, syncedAt, ...catalogFields(game) },
        update: { syncedAt, ...catalogFields(game) },
        select: { id: true },
      });
      await tx.gameGenre.deleteMany({ where: { gameId: saved.id } });
      await tx.gameGenre.createMany({
        data: genreLinks.map((genreId) => ({ gameId: saved.id, genreId })),
      });
    });
  }

  const created = await prisma.user.createMany({
    data: DEMO_USERS.map((user) => ({
      email: user.email,
      username: user.username,
      passwordHash: demoPasswordHash,
    })),
    skipDuplicates: true,
  });

  return {
    games: snapshot.games.length,
    genres: genreIds.size,
    demoUsersCreated: created.count,
  };
}
