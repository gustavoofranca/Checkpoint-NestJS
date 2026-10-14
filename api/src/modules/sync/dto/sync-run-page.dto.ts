import { ApiProperty } from '@nestjs/swagger';
import { SyncRunDto } from './sync-run.dto';

export class SyncRunPageDto {
  @ApiProperty({ type: [SyncRunDto] })
  data!: SyncRunDto[];

  @ApiProperty({ type: String, nullable: true, description: 'null on the last page' })
  nextCursor!: string | null;
}
