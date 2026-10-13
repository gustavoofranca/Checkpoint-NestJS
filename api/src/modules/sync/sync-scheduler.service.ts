import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  DAILY_SYNC_CRON,
  DAILY_SYNC_SCHEDULER,
  SYNC_JOB,
  SYNC_JOB_OPTIONS,
  SYNC_QUEUE,
  type SyncJobData,
} from './sync-queue';
import { SyncRunsService } from './sync-runs.service';

// Worker start-up: close runs a previous worker left RUNNING, then make sure the daily schedule
// exists. upsertJobScheduler is idempotent, so every restart leaves exactly one schedule.
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    @InjectQueue(SYNC_QUEUE) private readonly queue: Queue<SyncJobData>,
    private readonly runs: SyncRunsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.runs.failInterrupted();
    if (interrupted > 0) {
      this.logger.warn(`Marked ${String(interrupted)} interrupted sync run(s) as FAILED`);
    }
    await this.queue.upsertJobScheduler(
      DAILY_SYNC_SCHEDULER,
      { pattern: DAILY_SYNC_CRON, tz: 'UTC' },
      { name: SYNC_JOB, data: {}, opts: SYNC_JOB_OPTIONS },
    );
    this.logger.log(`Daily catalog sync scheduled (${DAILY_SYNC_CRON} UTC)`);
  }
}
