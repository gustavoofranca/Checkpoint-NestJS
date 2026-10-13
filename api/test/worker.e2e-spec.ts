import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_SYNC_CRON,
  DAILY_SYNC_SCHEDULER,
  SYNC_JOB,
  SYNC_QUEUE,
} from '../src/modules/sync/sync-queue';
import { WorkerModule } from '../src/worker.module';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

// The worker process's module as src/worker.ts boots it, with nothing overridden.
describe('worker process', () => {
  const prisma = createTestPrismaClient();
  let worker: TestingModule | undefined;

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function startWorker(): Promise<TestingModule> {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.forRoot(testConfig(liveDependencies()))],
    }).compile();
    await moduleRef.init();
    return moduleRef;
  }

  it('boots without overrides, consumes the sync queue and schedules the daily sync', async () => {
    worker = await startWorker();
    const queue = worker.get<Queue>(getQueueToken(SYNC_QUEUE));

    // A job for a run that does not exist is consumed and skipped without touching Steam.
    const job = await queue.add(SYNC_JOB, { runId: '0199d4a2-0000-7000-8000-000000000000' });
    await vi.waitFor(async () => {
      expect(await job.getState()).toBe('completed');
    });
    expect(await queue.getJobSchedulers()).toEqual([
      expect.objectContaining({
        key: DAILY_SYNC_SCHEDULER,
        name: SYNC_JOB,
        pattern: DAILY_SYNC_CRON,
        tz: 'UTC',
      }),
    ]);
  });
});
