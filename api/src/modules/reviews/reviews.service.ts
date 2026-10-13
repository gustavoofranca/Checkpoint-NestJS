import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { decodeCursor } from '../../common/pagination/cursor';
import { type Page, toPage } from '../../common/pagination/page';
import type { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ReviewDto } from './dto/review.dto';
import type { UpsertReviewDto } from './dto/upsert-review.dto';

const REVIEW_SELECT = {
  id: true,
  rating: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { username: true } },
} as const satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

// Newest first: (created_at, id) descending. Prisma writes timestamps with millisecond
// precision, the same as a JavaScript Date, so the cursor round-trips exactly.
const reviewCursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

function toReviewDto(row: ReviewRow): ReviewDto {
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: { username: row.user.username },
  };
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForGame(slug: string, query: PaginationQueryDto): Promise<Page<ReviewDto>> {
    const game = await this.prisma.game.findUnique({ where: { slug }, select: { id: true } });
    if (game === null) {
      throw new NotFoundException('Game not found.');
    }
    const cursor =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor, reviewCursorSchema);
    const after: Prisma.ReviewWhereInput =
      cursor === undefined
        ? {}
        : {
            createdAt: { lte: new Date(cursor.createdAt) },
            OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { id: { lt: cursor.id } }],
          };

    const rows = await this.prisma.review.findMany({
      where: { gameId: game.id, ...after },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: REVIEW_SELECT,
    });
    return toPage(
      rows,
      query.limit,
      (row) => ({ createdAt: row.createdAt.toISOString(), id: row.id }),
      toReviewDto,
    );
  }

  // Creates or replaces the caller's review. The author is always the caller: there is no way to
  // address another user's review.
  upsertOwn(userId: string, slug: string, dto: UpsertReviewDto): Promise<ReviewDto> {
    return this.prisma.$transaction(async (tx) => {
      const gameId = await lockGame(tx, slug);
      const review = await tx.review.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId, rating: dto.rating, body: dto.body },
        update: { rating: dto.rating, body: dto.body },
        select: REVIEW_SELECT,
      });
      await refreshRating(tx, gameId);
      return toReviewDto(review);
    });
  }

  async deleteOwn(userId: string, slug: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const gameId = await lockGame(tx, slug);
      const deleted = await tx.review.deleteMany({ where: { userId, gameId } });
      if (deleted.count === 0) {
        throw new NotFoundException('You have not reviewed this game.');
      }
      await refreshRating(tx, gameId);
    });
  }
}

// Every review write for a game takes this row lock first, so concurrent writes to the same game
// run one after another and each recomputes the rating from all committed reviews. Without it
// two transactions could each miss the other's review (docs/adr/0006).
async function lockGame(tx: Tx, slug: string): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM games WHERE slug = ${slug} FOR UPDATE`;
  const game = rows[0];
  if (game === undefined) {
    throw new NotFoundException('Game not found.');
  }
  return game.id;
}

async function refreshRating(tx: Tx, gameId: string): Promise<void> {
  const stats = await tx.review.aggregate({
    where: { gameId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const average =
    stats._avg.rating === null
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(stats._avg.rating).toDecimalPlaces(2);
  await tx.game.update({
    where: { id: gameId },
    data: { ratingAverage: average, ratingCount: stats._count._all },
  });
}
