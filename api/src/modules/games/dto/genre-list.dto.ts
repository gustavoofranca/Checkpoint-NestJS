import { ApiProperty } from '@nestjs/swagger';
import { GenreDto } from './genre.dto';

// Genres come from Steam's fixed taxonomy (a few dozen at most), so the list is served whole,
// capped at GENRE_LIMIT, instead of paginated.
export class GenreListDto {
  @ApiProperty({ type: [GenreDto] })
  data!: GenreDto[];
}
