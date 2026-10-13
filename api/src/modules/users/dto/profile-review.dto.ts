import { ApiProperty } from '@nestjs/swagger';
import { ProfileGameDto } from './profile-game.dto';

export class ProfileReviewDto {
  @ApiProperty({ type: ProfileGameDto })
  game!: ProfileGameDto;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ description: 'Plain text, never HTML' })
  body!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
