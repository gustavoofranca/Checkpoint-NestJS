import { ApiProperty } from '@nestjs/swagger';

export class RatingSummaryDto {
  @ApiProperty({ minimum: 0, maximum: 5, example: 4.5, description: '0 when unrated' })
  average!: number;

  @ApiProperty({ minimum: 0, example: 12 })
  count!: number;
}
