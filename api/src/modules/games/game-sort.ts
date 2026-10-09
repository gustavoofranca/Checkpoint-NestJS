import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { decodeCursor, INVALID_CURSOR } from '../../common/pagination/cursor';
import type { Prisma } from '../../generated/prisma/client';

export const GAME_SORTS = ['newest', 'top_rated', 'title'] as const;
export type GameSort = (typeof GAME_SORTS)[number];

// Each sort is a key plus the id as tie-breaker, so the order is total and keyset pagination
// never repeats or skips a game. Every pair is backed by an index on (key, id):
// - newest: release date descending, games without one (announced, "coming soon") first. That is
//   exactly a backward scan of the (release_date, id) index.
// - top_rated: average rating descending.
// - title: the application's title sort key ascending (docs/adr/0005).
export const GAME_ORDER_BY: Record<GameSort, Prisma.GameOrderByWithRelationInput[]> = {
  newest: [{ releaseDate: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
  top_rated: [{ ratingAverage: 'desc' }, { id: 'desc' }],
  title: [{ titleSort: 'asc' }, { id: 'asc' }],
};

const gameCursorSchema = z.discriminatedUnion('sort', [
  z.object({ sort: z.literal('newest'), releaseDate: z.iso.date().nullable(), id: z.uuid() }),
  z.object({
    sort: z.literal('top_rated'),
    ratingAverage: z.string().regex(/^[0-5]\.\d{2}$/),
    id: z.uuid(),
  }),
  z.object({ sort: z.literal('title'), titleSort: z.string().max(200), id: z.uuid() }),
]);

export type GameCursor = z.infer<typeof gameCursorSchema>;

// The row fields a cursor is built from.
export interface SortableGame {
  id: string;
  releaseDate: Date | null;
  ratingAverage: Prisma.Decimal;
  titleSort: string;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

// A cursor from another sort would point into a different order, so it is rejected.
export function decodeGameCursor(cursor: string, sort: GameSort): GameCursor {
  const decoded = decodeCursor(cursor, gameCursorSchema);
  if (decoded.sort !== sort) {
    throw new BadRequestException(INVALID_CURSOR);
  }
  return decoded;
}

export function cursorOf(sort: GameSort, game: SortableGame): GameCursor {
  switch (sort) {
    case 'newest':
      return {
        sort,
        releaseDate: game.releaseDate === null ? null : toDateOnly(game.releaseDate),
        id: game.id,
      };
    case 'top_rated':
      return { sort, ratingAverage: game.ratingAverage.toFixed(2), id: game.id };
    case 'title':
      return { sort, titleSort: game.titleSort, id: game.id };
  }
}

// The rows that come after the cursor in the sort's order. Each case is "key beyond the cursor,
// or same key and id beyond it", plus a redundant bound on the key alone: PostgreSQL cannot start
// an index scan from an OR, but it can from that bound, so a deep page reads only its own rows.
// (A row comparison, (key, id) < (k, i), would do both at once; Prisma cannot express it.)
export function afterCursor(cursor: GameCursor): Prisma.GameWhereInput {
  switch (cursor.sort) {
    case 'newest': {
      if (cursor.releaseDate === null) {
        return {
          OR: [{ releaseDate: null, id: { lt: cursor.id } }, { releaseDate: { not: null } }],
        };
      }
      const date = fromDateOnly(cursor.releaseDate);
      // "<= date" also excludes rows without a date, which all came first.
      return {
        releaseDate: { lte: date },
        OR: [{ releaseDate: { lt: date } }, { id: { lt: cursor.id } }],
      };
    }
    case 'top_rated':
      return {
        ratingAverage: { lte: cursor.ratingAverage },
        OR: [{ ratingAverage: { lt: cursor.ratingAverage } }, { id: { lt: cursor.id } }],
      };
    case 'title':
      return {
        titleSort: { gte: cursor.titleSort },
        OR: [{ titleSort: { gt: cursor.titleSort } }, { id: { gt: cursor.id } }],
      };
  }
}
