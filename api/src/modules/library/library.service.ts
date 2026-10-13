import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { decodeCursor } from '../../common/pagination/cursor';
import { type Page, toPage } from '../../common/pagination/page';
import { type LibraryStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { LibraryEntryDto } from './dto/library-entry.dto';
import type { ListLibraryQueryDto } from './dto/list-library-query.dto';

const ENTRY_SELECT = {
  gameId: true,
  status: true,
  updatedAt: true,
  game: { select: { id: true, slug: true, title: true, headerImageUrl: true } },
} as const satisfies Prisma.LibraryEntrySelect;

type EntryRow = Prisma.LibraryEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

// Most recently changed first: (updated_at, game_id) descending, served by the
// (user_id, updated_at, game_id) index.
const libraryCursorSchema = z.object({ updatedAt: z.iso.datetime(), gameId: z.uuid() });

function toEntryDto(row: EntryRow): LibraryEntryDto {
  return { game: row.game, status: row.status, updatedAt: row.updatedAt };
}

// Every query filters by the owner in its WHERE clause, with the id from the access token
// (docs/SECURITY.md section 1).
@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListLibraryQueryDto): Promise<Page<LibraryEntryDto>> {
    const cursor =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor, libraryCursorSchema);
    const after: Prisma.LibraryEntryWhereInput =
      cursor === undefined
        ? {}
        : {
            updatedAt: { lte: new Date(cursor.updatedAt) },
            OR: [
              { updatedAt: { lt: new Date(cursor.updatedAt) } },
              { gameId: { lt: cursor.gameId } },
            ],
          };

    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId, ...(query.status === undefined ? {} : { status: query.status }), ...after },
      orderBy: [{ updatedAt: 'desc' }, { gameId: 'desc' }],
      take: query.limit + 1,
      select: ENTRY_SELECT,
    });
    return toPage(
      rows,
      query.limit,
      (row) => ({ updatedAt: row.updatedAt.toISOString(), gameId: row.gameId }),
      toEntryDto,
    );
  }

  async setStatus(userId: string, gameId: string, status: LibraryStatus): Promise<LibraryEntryDto> {
    try {
      const entry = await this.prisma.libraryEntry.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId, status },
        update: { status },
        select: ENTRY_SELECT,
      });
      return toEntryDto(entry);
    } catch (error) {
      // P2003: the game_id foreign key found no game.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Game not found.');
      }
      throw error;
    }
  }

  async remove(userId: string, gameId: string): Promise<void> {
    const deleted = await this.prisma.libraryEntry.deleteMany({ where: { userId, gameId } });
    if (deleted.count === 0) {
      throw new NotFoundException('This game is not in your library.');
    }
  }
}
