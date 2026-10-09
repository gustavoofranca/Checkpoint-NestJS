import { ApiProperty } from '@nestjs/swagger';

export class GenreRefDto {
  @ApiProperty({ example: 'action' })
  slug!: string;

  @ApiProperty({ example: 'Action' })
  name!: string;
}
