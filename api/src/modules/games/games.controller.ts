import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { GameDetailDto } from './dto/game-detail.dto';
import { GamePageDto } from './dto/game-page.dto';
import { GameSlugParamDto } from './dto/game-slug-param.dto';
import { GenreListDto } from './dto/genre-list.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { GamesService } from './games.service';

// The catalog is readable by anyone (docs/SPEC.md, Roles).
@ApiTags('catalog')
@Public()
@Controller()
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get('games')
  @ApiOperation({ summary: 'List games, with optional title search, genre filter and sort' })
  @ApiOkResponse({ type: GamePageDto })
  @ApiProblemResponses(400)
  list(@Query() query: ListGamesQueryDto): Promise<GamePageDto> {
    return this.games.list(query);
  }

  @Get('games/:slug')
  @ApiOperation({ summary: 'Get one game with its genres and rating summary' })
  @ApiOkResponse({ type: GameDetailDto })
  @ApiProblemResponses(400, 404)
  detail(@Param() params: GameSlugParamDto): Promise<GameDetailDto> {
    return this.games.findBySlug(params.slug);
  }

  @Get('genres')
  @ApiOperation({ summary: 'List every genre with its number of games' })
  @ApiOkResponse({ type: GenreListDto })
  async genres(): Promise<GenreListDto> {
    return { data: await this.games.listGenres() };
  }
}
