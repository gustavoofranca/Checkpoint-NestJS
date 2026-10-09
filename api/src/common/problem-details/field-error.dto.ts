import { ApiProperty } from '@nestjs/swagger';

export class FieldErrorDto {
  @ApiProperty({ example: 'rating' })
  field!: string;

  @ApiProperty({ example: 'rating must not be greater than 5' })
  message!: string;
}
