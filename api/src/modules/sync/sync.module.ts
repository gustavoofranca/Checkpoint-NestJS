import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminSyncController } from './admin-sync.controller';
import { SYNC_QUEUE } from './sync-queue';
import { SyncRunsService } from './sync-runs.service';
import { SyncTriggerService } from './sync-trigger.service';

// HTTP side: the admin routes and the producer. It never runs a sync.
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: SYNC_QUEUE })],
  controllers: [AdminSyncController],
  providers: [SyncRunsService, SyncTriggerService],
})
export class SyncModule {}
