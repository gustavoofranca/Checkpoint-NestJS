import { ApiProperty } from '@nestjs/swagger';
import { SyncStatus, SyncTrigger } from '../../../generated/prisma/client';

export class SyncRunDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SyncTrigger })
  trigger!: SyncTrigger;

  @ApiProperty({ enum: SyncStatus })
  status!: SyncStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ description: 'Games written from Steam data' })
  gamesProcessed!: number;

  @ApiProperty({ description: 'Games skipped: no store data, invalid payload, or a write error' })
  gamesFailed!: number;

  @ApiProperty({ type: String, nullable: true, maxLength: 500 })
  errorMessage!: string | null;
}
