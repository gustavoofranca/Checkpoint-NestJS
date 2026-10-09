import { ApiProperty } from '@nestjs/swagger';
import { GameSummaryDto } from './game-summary.dto';

export class GamePageDto {
  @ApiProperty({ type: [GameSummaryDto] })
  data!: GameSummaryDto[];

  @ApiProperty({ type: String, nullable: true, description: 'null on the last page' })
  nextCursor!: string | null;
}
