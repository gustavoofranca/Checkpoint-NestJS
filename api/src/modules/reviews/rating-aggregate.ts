import { Prisma } from '../../generated/prisma/client';

// Recomputes a game's denormalized rating from its committed reviews (docs/adr/0006). Callers
// hold the game row lock (SELECT … FOR UPDATE) in the same transaction, so concurrent writers
// recompute one after another. Used by review writes and by the seed's demo reviews.
export async function refreshRating(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
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
