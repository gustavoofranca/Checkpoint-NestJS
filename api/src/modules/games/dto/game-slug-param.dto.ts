import { ApiProperty } from '@nestjs/swagger';
import { Matches, MaxLength } from 'class-validator';

export class GameSlugParamDto {
  @ApiProperty({ example: 'hades' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, digits and hyphens',
  })
  @MaxLength(120)
  slug!: string;
}
