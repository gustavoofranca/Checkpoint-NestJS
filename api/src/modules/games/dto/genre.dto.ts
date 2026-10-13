import { ApiProperty } from '@nestjs/swagger';
import { GenreRefDto } from './genre-ref.dto';

export class GenreDto extends GenreRefDto {
  @ApiProperty({ minimum: 0, example: 42 })
  gameCount!: number;
}
