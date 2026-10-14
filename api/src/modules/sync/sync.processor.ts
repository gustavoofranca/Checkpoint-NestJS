import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { reportError } from '../../common/error-reporting/sentry';
import { SyncTrigger } from '../../generated/prisma/client';
import { SYNC_QUEUE, type SyncJobData } from './sync-queue';
import { SyncRunner } from './sync-runner.service';
import { SyncAlreadyRunningError, SyncRunsService } from './sync-runs.service';

// Runs in the worker process only (src/worker.ts); the HTTP process just enqueues.
@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly runner: SyncRunner,
    private readonly runs: SyncRunsService,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    if (job.data.runId !== undefined && !(await this.runs.isRunning(job.data.runId))) {
      // A run closed before its job arrived (it could not be queued, or a restarted worker marked
      // it interrupted). Running it now would reopen a finished record.
      this.logger.warn(`Job for sync run ${job.data.runId} skipped: the run is no longer RUNNING`);
      return;
    }
    const runId = job.data.runId ?? (await this.startScheduledRun());
    if (runId === undefined) {
      return;
    }
    await this.runner.run(runId);
  }

  // A job fails only on an error the runner could not handle; the run itself is already FAILED.
  @OnWorkerEvent('failed')
  onFailed(job: Job<SyncJobData> | undefined, error: Error): void {
    const jobId = job?.id ?? 'unknown';
    this.logger.error({ err: error, jobId }, 'Sync job failed');
    reportError(error, { tags: { queue: SYNC_QUEUE, job_id: jobId } });
  }

  private async startScheduledRun(): Promise<string | undefined> {
    try {
      return await this.runs.start(SyncTrigger.SCHEDULED);
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.warn('Scheduled sync skipped: another run is in progress');
        return undefined;
      }
      throw error;
    }
  }
}
