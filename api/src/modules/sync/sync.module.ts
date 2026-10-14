import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminSyncController } from './admin-sync.controller';
import { SYNC_QUEUE } from './sync-queue';
import { SyncRunsService } from './sync-runs.service';
import { SyncTriggerService } from './sync-trigger.service';

const syncQueue = BullModule.registerQueue({ name: SYNC_QUEUE });

// HTTP side: the admin routes and the producer. It never runs a sync. The queue and the runs are
// exported for /metrics.
@Module({
  imports: [PrismaModule, syncQueue],
  controllers: [AdminSyncController],
  providers: [SyncRunsService, SyncTriggerService],
  exports: [syncQueue, SyncRunsService],
})
export class SyncModule {}
