import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { withTimeout } from '../../common/async/with-timeout';
import { SyncTrigger } from '../../generated/prisma/client';
import { SYNC_JOB, SYNC_JOB_OPTIONS, SYNC_QUEUE, type SyncJobData } from './sync-queue';
import { SyncAlreadyRunningError, SyncRunsService } from './sync-runs.service';

// BullMQ waits for its connection to be ready before sending a command, so with Redis down add()
// would hang. Past this delay the run is closed and the caller gets 503; if the job still lands
// later, the processor skips it because the run is no longer RUNNING.
const ENQUEUE_TIMEOUT_MS = 2_000;

// HTTP side of a manual sync: record the run, then enqueue it for the worker.
@Injectable()
export class SyncTriggerService {
  private readonly logger = new Logger(SyncTriggerService.name);

  constructor(
    private readonly runs: SyncRunsService,
    @InjectQueue(SYNC_QUEUE) private readonly queue: Queue<SyncJobData>,
  ) {}

  async startManual(): Promise<string> {
    let runId: string;
    try {
      runId = await this.runs.start(SyncTrigger.MANUAL);
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    try {
      // The run id as job id: enqueueing the same run twice adds one job.
      await withTimeout(
        this.queue.add(SYNC_JOB, { runId }, { ...SYNC_JOB_OPTIONS, jobId: runId }),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not enqueue sync run ${runId}: ${reason}`);
      await this.runs.fail(runId, { gamesProcessed: 0, gamesFailed: 0 }, 'Could not be queued.');
      throw new ServiceUnavailableException('The sync queue is unavailable. Try again later.');
    }
    return runId;
  }
}
