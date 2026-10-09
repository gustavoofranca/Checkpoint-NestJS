import { ApiProperty } from '@nestjs/swagger';
import { DependencyChecksDto } from './dependency-checks.dto';

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ type: DependencyChecksDto })
  checks!: DependencyChecksDto;
}
