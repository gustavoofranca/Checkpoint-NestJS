import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { GameIdParamDto } from './dto/game-id-param.dto';
import { LibraryEntryDto } from './dto/library-entry.dto';
import { LibraryPageDto } from './dto/library-page.dto';
import { ListLibraryQueryDto } from './dto/list-library-query.dto';
import { SetLibraryStatusDto } from './dto/set-library-status.dto';
import { LibraryService } from './library.service';

// Always the caller's own library: the routes live under /me and take no user id.
@ApiTags('library')
@ApiBearerAuth()
@Controller('me/library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({ summary: 'Your library, most recently changed first' })
  @ApiOkResponse({ type: LibraryPageDto })
  @ApiProblemResponses(400, 401)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLibraryQueryDto,
  ): Promise<LibraryPageDto> {
    return this.library.list(user.id, query);
  }

  @Put(':gameId')
  @ApiOperation({ summary: 'Add a game to your library or change its status' })
  @ApiOkResponse({ type: LibraryEntryDto })
  @ApiProblemResponses(400, 401, 404)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: GameIdParamDto,
    @Body() dto: SetLibraryStatusDto,
  ): Promise<LibraryEntryDto> {
    return this.library.setStatus(user.id, params.gameId, dto.status);
  }

  @Delete(':gameId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a game from your library' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 404)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: GameIdParamDto,
  ): Promise<void> {
    await this.library.remove(user.id, params.gameId);
  }
}
