import { ApiProperty } from '@nestjs/swagger';

export class ReviewAuthorDto {
  @ApiProperty({ example: 'demo_ana' })
  username!: string;
}
