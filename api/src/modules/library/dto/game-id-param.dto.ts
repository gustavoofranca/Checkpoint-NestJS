import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GameIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  gameId!: string;
}
