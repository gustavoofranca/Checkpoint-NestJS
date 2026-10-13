import { ApiProperty } from '@nestjs/swagger';

export class LibraryGameDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'hades' })
  slug!: string;

  @ApiProperty({ example: 'Hades' })
  title!: string;

  @ApiProperty({ format: 'uri' })
  headerImageUrl!: string;
}
