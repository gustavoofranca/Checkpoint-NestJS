import type { PrismaClient } from '../generated/prisma/client';
import type { CatalogGame, CatalogSnapshot } from '../modules/sync/catalog-game';
import { baseSlug, upsertGenres, writeGame } from '../modules/sync/catalog-writer';

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

// Deterministic within the snapshot: the lowest app id keeps the plain slug, later ones get their
// app id appended.
export function assignSlugs(games: readonly CatalogGame[]): Map<number, string> {
  const slugs = new Map<number, string>();
  const taken = new Set<string>();
  for (const game of [...games].sort((a, b) => a.steamAppId - b.steamAppId)) {
    const base = baseSlug(game);
    const slug = taken.has(base) ? `${base}-${String(game.steamAppId)}` : base;
    taken.add(slug);
    slugs.set(game.steamAppId, slug);
  }
  return slugs;
}

// Idempotent: games are upserted by Steam app id, genres by name, demo users only when missing.
// A re-run refreshes catalog fields but keeps slugs and ratings (src/modules/sync/catalog-writer).
export async function seedDatabase(
  prisma: PrismaClient,
  snapshot: CatalogSnapshot,
  demoPasswordHash: string,
): Promise<SeedReport> {
  const syncedAt = new Date(snapshot.fetchedAt);
  const slugs = assignSlugs(snapshot.games);
  const genreIds = await upsertGenres(
    prisma,
    snapshot.games.flatMap((game) => game.genres),
  );

  for (const game of snapshot.games) {
    const slugIfNew = slugs.get(game.steamAppId);
    if (slugIfNew === undefined) {
      throw new Error(`No slug assigned to app ${String(game.steamAppId)}`);
    }
    await writeGame(prisma, game, { syncedAt, slugIfNew, genreIds });
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
