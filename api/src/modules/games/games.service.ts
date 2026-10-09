import { Injectable, NotFoundException } from '@nestjs/common';
import { type Page, toPage } from '../../common/pagination/page';
import { escapeLike } from '../../common/text/escape-like';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { GameDetailDto } from './dto/game-detail.dto';
import type { GameSummaryDto } from './dto/game-summary.dto';
import type { GenreDto } from './dto/genre.dto';
import type { ListGamesQueryDto } from './dto/list-games-query.dto';
import {
  GAME_DETAIL_SELECT,
  GAME_SUMMARY_SELECT,
  toGameDetail,
  toGameSummary,
} from './game.mapper';
import { afterCursor, cursorOf, decodeGameCursor, GAME_ORDER_BY } from './game-sort';

// Steam's genre taxonomy has a few dozen entries; the cap keeps the response bounded anyway.
export const GENRE_LIMIT = 100;

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListGamesQueryDto): Promise<Page<GameSummaryDto>> {
    const cursor =
      query.cursor === undefined ? undefined : decodeGameCursor(query.cursor, query.sort);
    const filters: Prisma.GameWhereInput[] = [];
    if (query.q !== undefined) {
      // ILIKE '%…%', served by the trigram index on title.
      filters.push({ title: { contains: escapeLike(query.q), mode: 'insensitive' } });
    }
    if (query.genre !== undefined) {
      filters.push({ genres: { some: { genre: { slug: query.genre } } } });
    }
    if (cursor !== undefined) {
      filters.push(afterCursor(cursor));
    }

    const rows = await this.prisma.game.findMany({
      where: { AND: filters },
      orderBy: GAME_ORDER_BY[query.sort],
      take: query.limit + 1,
      select: GAME_SUMMARY_SELECT,
    });
    return toPage(rows, query.limit, (row) => cursorOf(query.sort, row), toGameSummary);
  }

  async findBySlug(slug: string): Promise<GameDetailDto> {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      select: GAME_DETAIL_SELECT,
    });
    if (game === null) {
      throw new NotFoundException('Game not found.');
    }
    return toGameDetail(game);
  }

  async listGenres(): Promise<GenreDto[]> {
    const genres = await this.prisma.genre.findMany({
      select: { slug: true, name: true, _count: { select: { games: true } } },
      orderBy: { name: 'asc' },
      take: GENRE_LIMIT,
    });
    return genres.map((genre) => ({
      slug: genre.slug,
      name: genre.name,
      gameCount: genre._count.games,
    }));
  }
}
