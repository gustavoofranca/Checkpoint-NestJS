import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class UsernameParamDto {
  @ApiProperty({ example: 'demo_ana' })
  @Matches(/^[a-z0-9_]{3,24}$/, {
    message: 'username must be 3 to 24 lowercase letters, digits or underscores',
  })
  username!: string;
}
