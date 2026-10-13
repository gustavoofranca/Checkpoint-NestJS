import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { type Page, toPage } from '../../common/pagination/page';
import { escapeLike } from '../../common/text/escape-like';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
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

// Invalidated by catalog sync (P6) and by every review write, which changes ratings.
export const CATALOG_CACHE = 'games';
const LIST_TTL_SECONDS = 5 * 60;
const DETAIL_TTL_SECONDS = 10 * 60;
const GENRES_TTL_SECONDS = 5 * 60;

// Equivalent queries share a key: the title search is case-insensitive and trimmed already.
function listCacheKey(query: ListGamesQueryDto): string {
  const normalized = JSON.stringify([
    query.q?.toLowerCase() ?? null,
    query.genre ?? null,
    query.sort,
    query.limit,
    query.cursor ?? null,
  ]);
  return `list:${createHash('sha256').update(normalized).digest('hex')}`;
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(query: ListGamesQueryDto): Promise<Page<GameSummaryDto>> {
    // Decoding first: an invalid cursor is a 400 whether or not a page is cached.
    const cursor =
      query.cursor === undefined ? undefined : decodeGameCursor(query.cursor, query.sort);
    return this.cache.getOrLoad(CATALOG_CACHE, listCacheKey(query), LIST_TTL_SECONDS, async () => {
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
    });
  }

  // Unknown slugs are not cached: the loader throws before anything is written.
  findBySlug(slug: string): Promise<GameDetailDto> {
    return this.cache.getOrLoad(CATALOG_CACHE, `detail:${slug}`, DETAIL_TTL_SECONDS, async () => {
      const game = await this.prisma.game.findUnique({
        where: { slug },
        select: GAME_DETAIL_SELECT,
      });
      if (game === null) {
        throw new NotFoundException('Game not found.');
      }
      return toGameDetail(game);
    });
  }

  listGenres(): Promise<GenreDto[]> {
    return this.cache.getOrLoad(CATALOG_CACHE, 'genres', GENRES_TTL_SECONDS, async () => {
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
    });
  }

  // For writers outside the catalog whose changes show up in it (review ratings, sync).
  invalidateCatalog(): Promise<void> {
    return this.cache.invalidate(CATALOG_CACHE);
  }
}
