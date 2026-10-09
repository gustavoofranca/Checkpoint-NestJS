import { ApiProperty } from '@nestjs/swagger';

export type DependencyStatus = 'up' | 'down';

export class DependencyChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database!: DependencyStatus;

  @ApiProperty({ enum: ['up', 'down'] })
  redis!: DependencyStatus;
}
