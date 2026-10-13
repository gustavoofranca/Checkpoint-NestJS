import type { JobsOptions } from 'bullmq';

export const SYNC_QUEUE = 'catalog-sync';
export const SYNC_JOB = 'sync';
export const DAILY_SYNC_SCHEDULER = 'daily-catalog-sync';
// Every day at 04:00 UTC. A fixed time, not "every 24 hours from now", so restarting the worker
// (every deploy) does not trigger a sync of its own.
export const DAILY_SYNC_CRON = '0 4 * * *';

// A manual run carries the SyncRun created by the API; a scheduled one creates its own.
export interface SyncJobData {
  runId?: string;
}

// One attempt: the Steam client already retries each request with backoff, a failed run is
// recorded with its reason, and the next scheduled run starts over (docs/adr/0010).
export const SYNC_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};
