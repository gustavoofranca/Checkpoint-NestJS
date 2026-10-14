import { ApiProperty } from '@nestjs/swagger';

export class SyncStartedDto {
  @ApiProperty({ format: 'uuid', description: 'Follow it in GET /admin/sync/runs' })
  runId!: string;
}
