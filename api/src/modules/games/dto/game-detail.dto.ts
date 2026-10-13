import { ApiProperty } from '@nestjs/swagger';
import { GameSummaryDto } from './game-summary.dto';

export class GameDetailDto extends GameSummaryDto {
  @ApiProperty({ description: 'Plain text, never HTML' })
  shortDescription!: string;

  @ApiProperty({ type: [String] })
  developers!: string[];

  @ApiProperty({ type: [String] })
  publishers!: string[];
}
