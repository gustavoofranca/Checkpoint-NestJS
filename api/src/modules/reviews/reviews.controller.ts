import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { GameSlugParamDto } from '../games/dto/game-slug-param.dto';
import { ReviewPageDto } from './dto/review-page.dto';
import { ReviewDto } from './dto/review.dto';
import { UpsertReviewDto } from './dto/upsert-review.dto';
import { ReviewsService } from './reviews.service';

// There is no route that takes a review id for writing: a user can only ever touch their own
// review, through /me (docs/SPEC.md, Reviews).
@ApiTags('reviews')
@Controller('games/:slug/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Reviews of a game, newest first' })
  @ApiOkResponse({ type: ReviewPageDto })
  @ApiProblemResponses(400, 404)
  list(
    @Param() params: GameSlugParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.listForGame(params.slug, query);
  }

  @Put('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or replace your review of a game' })
  @ApiOkResponse({ type: ReviewDto })
  @ApiProblemResponses(400, 401, 404)
  upsert(
    @Param() params: GameSlugParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.upsertOwn(user.id, params.slug, dto);
  }

  @Delete('me')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your review of a game' })
  @ApiNoContentResponse()
  @ApiProblemResponses(400, 401, 404)
  async remove(
    @Param() params: GameSlugParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.reviews.deleteOwn(user.id, params.slug);
  }
}
