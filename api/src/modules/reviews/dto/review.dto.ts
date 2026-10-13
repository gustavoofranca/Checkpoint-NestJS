import { ApiProperty } from '@nestjs/swagger';
import { ReviewAuthorDto } from './review-author.dto';

export class ReviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  rating!: number;

  @ApiProperty({
    description: 'Plain text, never HTML',
    example: 'Tight combat and a great score.',
  })
  body!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: ReviewAuthorDto })
  author!: ReviewAuthorDto;
}
