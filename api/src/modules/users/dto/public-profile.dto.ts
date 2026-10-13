import { ApiProperty } from '@nestjs/swagger';
import { ProfileReviewDto } from './profile-review.dto';

// Public by design: no email, no role, no id (docs/SPEC.md, Library and profiles).
export class PublicProfileDto {
  @ApiProperty({ example: 'demo_ana' })
  username!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  joinedAt!: Date;

  @ApiProperty({ minimum: 0 })
  reviewCount!: number;

  @ApiProperty({ type: [ProfileReviewDto], description: 'The 5 most recent, newest first' })
  latestReviews!: ProfileReviewDto[];
}
