import type { Prisma } from '../../generated/prisma/client';
import type { GameDetailDto } from './dto/game-detail.dto';
import type { GameSummaryDto } from './dto/game-summary.dto';

// One query: the game columns plus its genres through the join table (no N+1).
export const GAME_SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleSort: true,
  headerImageUrl: true,
  releaseDate: true,
  isFree: true,
  priceCents: true,
  currency: true,
  ratingAverage: true,
  ratingCount: true,
  genres: {
    select: { genre: { select: { slug: true, name: true } } },
    orderBy: { genre: { name: 'asc' } },
  },
} as const satisfies Prisma.GameSelect;

export const GAME_DETAIL_SELECT = {
  ...GAME_SUMMARY_SELECT,
  shortDescription: true,
  developers: true,
  publishers: true,
} as const satisfies Prisma.GameSelect;

type SummaryRow = Prisma.GameGetPayload<{ select: typeof GAME_SUMMARY_SELECT }>;
type DetailRow = Prisma.GameGetPayload<{ select: typeof GAME_DETAIL_SELECT }>;

export function toGameSummary(row: SummaryRow): GameSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    headerImageUrl: row.headerImageUrl,
    releaseDate: row.releaseDate === null ? null : row.releaseDate.toISOString().slice(0, 10),
    genres: row.genres.map(({ genre }) => ({ slug: genre.slug, name: genre.name })),
    // numeric(3,2) holds at most 5.00, which a double represents exactly enough for display.
    rating: { average: row.ratingAverage.toNumber(), count: row.ratingCount },
    isFree: row.isFree,
    price:
      row.priceCents === null || row.currency === null
        ? null
        : { amountCents: row.priceCents, currency: row.currency },
  };
}

export function toGameDetail(row: DetailRow): GameDetailDto {
  return Object.assign(toGameSummary(row), {
    shortDescription: row.shortDescription,
    developers: row.developers,
    publishers: row.publishers,
  });
}
