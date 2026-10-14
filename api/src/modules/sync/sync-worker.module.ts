import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GamesModule } from '../games/games.module';
import {
  DEFAULT_STEAM_CLIENT_OPTIONS,
  STEAM_CLIENT_OPTIONS,
  SteamClient,
} from './steam/steam-client';
import { SyncProcessor } from './sync.processor';
import { SYNC_QUEUE } from './sync-queue';
import { DEFAULT_SYNC_OPTIONS, SYNC_OPTIONS, SyncRunner } from './sync-runner.service';
import { SyncRunsService } from './sync-runs.service';
import { SyncScheduler } from './sync-scheduler.service';

// Worker side: consumes the queue and talks to Steam (docs/adr/0010).
@Module({
  imports: [PrismaModule, GamesModule, BullModule.registerQueue({ name: SYNC_QUEUE })],
  providers: [
    { provide: STEAM_CLIENT_OPTIONS, useValue: DEFAULT_STEAM_CLIENT_OPTIONS },
    { provide: SYNC_OPTIONS, useValue: DEFAULT_SYNC_OPTIONS },
    SteamClient,
    SyncRunsService,
    SyncRunner,
    SyncProcessor,
    SyncScheduler,
  ],
  exports: [SyncRunner],
})
export class SyncWorkerModule {}
