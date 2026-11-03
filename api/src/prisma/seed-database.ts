import type { PrismaClient } from '../generated/prisma/client';
import { refreshRating } from '../modules/reviews/rating-aggregate';
import type { CatalogGame, CatalogSnapshot } from '../modules/sync/catalog-game';
import { baseSlug, upsertGenres, writeGame } from '../modules/sync/catalog-writer';

// Fixed, obviously fake accounts on the reserved .test domain. Their password comes from the
// environment, so none is committed.
export const DEMO_USERS = [
  { email: 'ana@checkpoint.test', username: 'demo_ana' },
  { email: 'bruno@checkpoint.test', username: 'demo_bruno' },
] as const;

type DemoUsername = (typeof DEMO_USERS)[number]['username'];

// A few reviews by the demo accounts, so a fresh install shows ratings, a "Top rated" row and
// non-empty profiles. Games are named by Steam app id, which never changes.
export const DEMO_REVIEWS: readonly {
  username: DemoUsername;
  steamAppId: number;
  rating: number;
  body: string;
}[] = [
  {
    username: 'demo_ana',
    steamAppId: 1145350,
    rating: 5,
    body: 'Every run teaches you something new. The weapon aspects and the boons stack in ways that keep the hundredth attempt interesting.',
  },
  {
    username: 'demo_ana',
    steamAppId: 504230,
    rating: 5,
    body: 'Precise controls and a story about anxiety that lands without preaching. The B-sides are brutal and fair.',
  },
  {
    username: 'demo_ana',
    steamAppId: 367520,
    rating: 4,
    body: 'Huge, moody and full of secrets. Some bosses drag on, but finding a new area never stopped feeling good.',
  },
  {
    username: 'demo_ana',
    steamAppId: 413150,
    rating: 4,
    body: 'The most relaxing game on my list. A season goes by too fast, in the best way.',
  },
  {
    username: 'demo_ana',
    steamAppId: 620,
    rating: 5,
    body: 'Still the funniest puzzle game I have played, and co-op is a whole second game.',
  },
  {
    username: 'demo_ana',
    steamAppId: 753640,
    rating: 5,
    body: 'Go in knowing nothing. The only progression is what you understand, and that is the point.',
  },
  {
    username: 'demo_ana',
    steamAppId: 2379780,
    rating: 4,
    body: 'Poker hands as a deckbuilder sounds silly and is impossible to put down. One more ante.',
  },
  {
    username: 'demo_ana',
    steamAppId: 1091500,
    rating: 3,
    body: 'Night City looks incredible and the main story is strong, but the open world feels thin between missions.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 1086940,
    rating: 5,
    body: 'A tabletop campaign that reacts to almost anything you try. Act one alone is a complete game.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 1245620,
    rating: 5,
    body: 'Walking into the open world for the first time is one of the best moments in the genre.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 427520,
    rating: 5,
    body: 'The factory must grow. I came for an hour and lost a weekend to train signals.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 646570,
    rating: 4,
    body: 'The deckbuilder everyone copied, and still one of the tightest. Every relic choice matters.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 105600,
    rating: 4,
    body: 'Looks simple, then the bosses and the building take over. Best with friends.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 1145350,
    rating: 4,
    body: 'More of what made the first one great, with a moodier tone. The new movement takes some getting used to.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 892970,
    rating: 3,
    body: 'Great exploration with friends, but the late-game grind wore me down.',
  },
  {
    username: 'demo_bruno',
    steamAppId: 730,
    rating: 2,
    body: 'The shooting is as sharp as ever, but matchmaking and cheaters made most evenings frustrating.',
  },
];

export interface SeedReport {
  games: number;
  genres: number;
  demoUsersCreated: number;
  demoReviewsCreated: number;
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
    demoReviewsCreated: await seedDemoReviews(prisma),
  };
}

// Creates each demo review that does not exist yet, never touching one that does: a re-run keeps
// whatever a demo account changed in the app. Each write locks the game row and recomputes its
// rating, like a review written through the API. The catalog cache is not cleared: cached pages
// show the new ratings once they expire (5 to 10 minutes).
async function seedDemoReviews(prisma: PrismaClient): Promise<number> {
  const users = await prisma.user.findMany({
    where: { username: { in: DEMO_USERS.map((user) => user.username) } },
    select: { id: true, username: true },
  });
  const userIds = new Map(users.map((user) => [user.username, user.id]));
  let created = 0;
  for (const review of DEMO_REVIEWS) {
    const userId = userIds.get(review.username);
    if (userId === undefined) {
      throw new Error(`Demo user ${review.username} is missing`);
    }
    const wrote = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM games WHERE steam_app_id = ${review.steamAppId} FOR UPDATE`;
      const gameId = rows[0]?.id;
      if (gameId === undefined) {
        throw new Error(
          `Demo review for app ${String(review.steamAppId)}: game not in the catalog`,
        );
      }
      const inserted = await tx.review.createMany({
        data: [{ userId, gameId, rating: review.rating, body: review.body }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        return false;
      }
      await refreshRating(tx, gameId);
      return true;
    });
    if (wrote) {
      created += 1;
    }
  }
  return created;
}
