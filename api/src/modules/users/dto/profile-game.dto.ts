import { ApiProperty } from '@nestjs/swagger';

export class ProfileGameDto {
  @ApiProperty({ example: 'hades' })
  slug!: string;

  @ApiProperty({ example: 'Hades' })
  title!: string;
}
