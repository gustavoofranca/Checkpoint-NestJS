import { ApiProperty } from '@nestjs/swagger';
import { ReviewDto } from './review.dto';

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewDto] })
  data!: ReviewDto[];

  @ApiProperty({ type: String, nullable: true, description: 'null on the last page' })
  nextCursor!: string | null;
}
