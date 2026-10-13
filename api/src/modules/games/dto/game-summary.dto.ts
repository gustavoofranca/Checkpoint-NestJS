import { ApiProperty } from '@nestjs/swagger';
import { GenreRefDto } from './genre-ref.dto';
import { PriceDto } from './price.dto';
import { RatingSummaryDto } from './rating-summary.dto';

export class GameSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'hades' })
  slug!: string;

  @ApiProperty({ example: 'Hades' })
  title!: string;

  @ApiProperty({ format: 'uri' })
  headerImageUrl!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'null for games without a release date yet',
  })
  releaseDate!: string | null;

  @ApiProperty({ type: [GenreRefDto] })
  genres!: GenreRefDto[];

  @ApiProperty({ type: RatingSummaryDto })
  rating!: RatingSummaryDto;

  @ApiProperty()
  isFree!: boolean;

  @ApiProperty({ type: PriceDto, nullable: true, description: 'null when free or not sold' })
  price!: PriceDto | null;
}
