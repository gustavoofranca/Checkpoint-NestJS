import { ApiProperty } from '@nestjs/swagger';

export class PriceDto {
  @ApiProperty({ example: 2499, description: 'List price in the smallest currency unit' })
  amountCents!: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 code' })
  currency!: string;
}
