import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

// Rating and text only. The author comes from the access token and the game from the URL, so a
// body cannot target someone else's review (docs/SECURITY.md section 1).
export class UpsertReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    description: 'Plain text; leading and trailing spaces are removed',
  })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  body!: string;
}
