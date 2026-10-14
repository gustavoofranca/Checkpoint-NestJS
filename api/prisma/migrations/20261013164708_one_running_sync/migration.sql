-- At most one sync run at a time, enforced by the database (docs/adr/0010): running_lock is true
-- while a run is RUNNING and null afterwards, and the unique index admits a single true.
ALTER TABLE "sync_runs" ADD COLUMN "running_lock" BOOLEAN;

CREATE UNIQUE INDEX "sync_runs_running_lock_key" ON "sync_runs"("running_lock");

-- The lock and the status cannot disagree: true exactly when RUNNING, never false.
ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_running_lock_check"
    CHECK ((status = 'RUNNING' AND running_lock = true) OR (status <> 'RUNNING' AND running_lock IS NULL));
