import { titleSortKey } from '../../src/common/text/title-sort-key';
import { Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { createPrismaClient } from '../../src/prisma/create-prisma-client';
import { liveDependencies } from './test-config';

export function createTestPrismaClient(): PrismaClient {
  return createPrismaClient(liveDependencies().DATABASE_URL);
}

// Children before parents, so foreign keys never block a delete.
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.review.deleteMany(),
    prisma.libraryEntry.deleteMany(),
    prisma.gameGenre.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.game.deleteMany(),
    prisma.genre.deleteMany(),
    prisma.user.deleteMany(),
    prisma.syncRun.deleteMany(),
  ]);
}

let sequence = 0;
function next(): number {
  sequence += 1;
  return sequence;
}

export async function createUser(
  prisma: PrismaClient,
  overrides: Partial<Prisma.UserCreateInput> = {},
): Promise<{ id: string; email: string }> {
  const n = next();
  return prisma.user.create({
    data: {
      email: `user${String(n)}@checkpoint.test`,
      username: `user_${String(n)}`,
      passwordHash: 'not-a-hash-tests-never-log-in',
      ...overrides,
    },
    select: { id: true, email: true },
  });
}

export async function createGame(
  prisma: PrismaClient,
  overrides: Partial<Prisma.GameCreateInput> = {},
): Promise<{ id: string }> {
  const n = next();
  const title = overrides.title ?? `Test Game ${String(n)}`;
  return prisma.game.create({
    data: {
      steamAppId: 900_000 + n,
      slug: `test-game-${String(n)}`,
      title,
      titleSort: titleSortKey(title),
      shortDescription: 'A game created by a test.',
      headerImageUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${String(n)}/header.jpg`,
      developers: ['Test Studio'],
      publishers: ['Test Publisher'],
      isFree: false,
      priceCents: 1999,
      currency: 'USD',
      syncedAt: new Date(),
      ...overrides,
    },
    select: { id: true },
  });
}

// The constraint PostgreSQL reported, read from the driver error Prisma wraps.
export async function violatedConstraint(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      throw error;
    }
    // CHECK violations name the constraint in the message, UNIQUE violations in `index`.
    const text = JSON.stringify(error.meta ?? {});
    const match = /constraint \\"([a-z_]+)\\"|"index":"([a-z_]+)"/.exec(text);
    const name = match?.[1] ?? match?.[2];
    if (name === undefined) {
      throw new Error(`Could not read a constraint name from: ${error.code}`, { cause: error });
    }
    return name;
  }
  throw new Error('Expected the database to reject the write');
}
