import { slugify } from '../../common/text/slugify';
import { titleSortKey } from '../../common/text/title-sort-key';
import type { PrismaClient } from '../../generated/prisma/client';
import type { CatalogGame } from './catalog-game';

// Writes catalog games, shared by the seed (bundled snapshot) and the sync (live Steam data).
// Games are upserted by Steam app id and genres by name. An update refreshes catalog fields but
// keeps the slug (it is a URL) and the rating (it comes from reviews).

export function baseSlug(game: CatalogGame): string {
  return slugify(game.title) || `app-${String(game.steamAppId)}`;
}

function genreSlug(name: string): string {
  const slug = slugify(name);
  if (slug === '') {
    throw new Error(`Genre "${name}" has no usable slug`);
  }
  return slug;
}

export async function upsertGenres(
  prisma: PrismaClient,
  names: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of new Set(names)) {
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

// For a game not in the database yet: its title's slug, or with the app id appended when another
// game already holds it.
export async function slugForNewGame(prisma: PrismaClient, game: CatalogGame): Promise<string> {
  const base = baseSlug(game);
  const holder = await prisma.game.findUnique({
    where: { slug: base },
    select: { steamAppId: true },
  });
  return holder === null || holder.steamAppId === game.steamAppId
    ? base
    : `${base}-${String(game.steamAppId)}`;
}

function catalogFields(game: CatalogGame) {
  return {
    title: game.title,
    titleSort: titleSortKey(game.title),
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

interface WriteGameOptions {
  syncedAt: Date;
  // Used only when the game is created; an existing game keeps its slug.
  slugIfNew: string;
  genreIds: ReadonlyMap<string, string>;
}

export async function writeGame(
  prisma: PrismaClient,
  game: CatalogGame,
  { syncedAt, slugIfNew, genreIds }: WriteGameOptions,
): Promise<void> {
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
      create: { steamAppId: game.steamAppId, slug: slugIfNew, syncedAt, ...catalogFields(game) },
      update: { syncedAt, ...catalogFields(game) },
      select: { id: true },
    });
    await tx.gameGenre.deleteMany({ where: { gameId: saved.id } });
    await tx.gameGenre.createMany({
      data: genreLinks.map((genreId) => ({ gameId: saved.id, genreId })),
    });
  });
}
