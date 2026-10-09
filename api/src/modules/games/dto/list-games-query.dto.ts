import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { GAME_SORTS, type GameSort } from '../game-sort';

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListGamesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 64,
    description: 'Matches anywhere in the title, case-insensitively; % and _ are literal',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 64)
  q?: string;

  @ApiPropertyOptional({ example: 'action', description: 'Genre slug from GET /genres' })
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, { message: 'genre must be a genre slug' })
  @MaxLength(60)
  genre?: string;

  @ApiPropertyOptional({
    enum: GAME_SORTS,
    default: 'newest',
    description: 'newest lists games without a release date first',
  })
  @IsOptional()
  @IsIn(GAME_SORTS)
  sort: GameSort = 'newest';
}
