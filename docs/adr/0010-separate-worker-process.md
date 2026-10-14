# 0010. A separate worker process for the catalog sync

- Status: accepted
- Date: 2026-10-13

## Context

A sync calls Steam about 200 times, 2 seconds apart: roughly 7 minutes of mostly waiting. It must
run daily and on demand by an admin, never twice at the same time, and must not slow the API.

## Decision

- **Two processes from one codebase.** `src/main.ts` serves HTTP; `src/worker.ts` boots a Nest
  application context with no HTTP server and consumes the BullMQ queue `catalog-sync`. The HTTP
  process only enqueues; the Steam client is only registered in the worker
  (`src/modules/sync/sync-worker.module.ts`).
- **Daily schedule**: a BullMQ job scheduler with a fixed cron, 04:00 UTC, upserted by the worker on
  start-up. A fixed time instead of "every 24 hours" so that restarting the worker does not start a
  sync, and upserting means any number of restarts leaves one schedule.
- **Manual runs**: `POST /admin/sync` creates the `SyncRun` row, then enqueues a job whose id is the
  run id, and answers 202 with that id.
- **One run at a time, enforced by PostgreSQL.** `sync_runs.running_lock` is `true` while a run is
  RUNNING and `null` otherwise, with a unique index and a CHECK tying it to the status. Creating a
  second RUNNING row fails, which the API turns into 409 and a scheduled job into a skipped run.
  Two simultaneous `POST /admin/sync` cannot both start one.
- **Interrupted runs**: with a single worker, any run still RUNNING when a worker starts was cut
  short; it is marked FAILED so it does not block later syncs.
- **One attempt per job.** The Steam client already retries every request with backoff, a failed
  run is recorded with its reason, and the next scheduled run starts over. Retrying the job would
  re-request every game from the start while Steam is still refusing.

## Consequences

- Deploying means running two processes (Compose service `worker`, profile `worker`, until the
  production image in P8).
- The API keeps answering during a sync; the only shared resources are PostgreSQL and Redis.
- "Interrupted" detection assumes one worker. Running several would need a heartbeat per run
  instead.
- `docs/ARCHITECTURE.md` asks for job attempts with exponential backoff; this ADR replaces job-level
  retries with request-level ones, for the reason above.

## Alternatives considered

- **Running the sync inside the API process** (`@nestjs/schedule`): one process less, but every API
  replica would schedule it, and a 7-minute job would share the event loop with requests.
- **A unique BullMQ job id alone** to prevent concurrent runs: it deduplicates jobs, not runs. A
  scheduled job and a manual one have different ids, and the `SyncRun` rows could still disagree.
- **An advisory lock**: also correct, but invisible in the data; the lock column shows the state in
  the table the admin endpoint reads.
