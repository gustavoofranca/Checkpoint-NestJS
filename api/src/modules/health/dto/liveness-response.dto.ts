import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}
