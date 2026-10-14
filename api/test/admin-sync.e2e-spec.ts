import { setTimeout as sleep } from 'node:timers/promises';
import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Role, SyncStatus, SyncTrigger } from '../src/generated/prisma/client';
import { loadConfig } from '../src/config/app-config';
import {
  DAILY_SYNC_CRON,
  DAILY_SYNC_SCHEDULER,
  SYNC_JOB,
  SYNC_QUEUE,
} from '../src/modules/sync/sync-queue';
import { accessTokenFrom, registerAndLogin, type Signed } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createTestWorker } from './support/create-test-worker';
import { createTestPrismaClient, resetDatabase } from './support/database';
import { FakeSteam, steamGame } from './support/fake-steam';
import {
  liveDependencies,
  testConfig,
  testEnv,
  UNREACHABLE_REDIS_URL,
} from './support/test-config';

const startedSchema = z.object({ runId: z.uuid() });
const runsSchema = z.object({
  data: z.array(
    z.object({ id: z.uuid(), status: z.enum(SyncStatus), trigger: z.enum(SyncTrigger) }),
  ),
  nextCursor: z.string().nullable(),
});

describe('admin sync', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  let user: Signed;
  let adminToken: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ config: testConfig(liveDependencies()) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await registerAndLogin(app);
    const admin = await registerAndLogin(app);
    await prisma.user.update({
      where: { email: admin.credentials.email },
      data: { role: Role.ADMIN },
    });
    // The role is read from the token, so the promoted user signs in again.
    adminToken = accessTokenFrom(
      await http()
        .post('/api/v1/auth/login')
        .send({ email: admin.credentials.email, password: admin.credentials.password })
        .expect(200),
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /admin/sync', () => {
    it('answers 401 without a token and 403 for a USER', async () => {
      await http().post('/api/v1/admin/sync').expect(401);
      await http()
        .post('/api/v1/admin/sync')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(403);

      expect(await prisma.syncRun.count()).toBe(0);
    });

    it('records a RUNNING run and enqueues it for an ADMIN', async () => {
      const response = await http()
        .post('/api/v1/admin/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(202);

      const { runId } = startedSchema.parse(response.body);
      expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
        trigger: SyncTrigger.MANUAL,
        status: SyncStatus.RUNNING,
      });
      const queue = app.get<Queue>(getQueueToken(SYNC_QUEUE));
      expect(await queue.getJob(runId)).toMatchObject({ data: { runId } });
    });

    it('answers 409 while a run is active', async () => {
      await http()
        .post('/api/v1/admin/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(202);

      const response = await http()
        .post('/api/v1/admin/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toMatchObject({ detail: 'A catalog sync is already running.' });
      expect(await prisma.syncRun.count()).toBe(1);
    });
  });

  describe('GET /admin/sync/runs', () => {
    it('lists runs newest first for an ADMIN and refuses a USER', async () => {
      const older = await prisma.syncRun.create({
        data: {
          trigger: SyncTrigger.SCHEDULED,
          status: SyncStatus.SUCCEEDED,
          startedAt: new Date(Date.now() - 60_000),
        },
        select: { id: true },
      });
      const newer = await prisma.syncRun.create({
        data: { trigger: SyncTrigger.MANUAL, status: SyncStatus.FAILED, startedAt: new Date() },
        select: { id: true },
      });

      const first = runsSchema.parse(
        (
          await http()
            .get('/api/v1/admin/sync/runs')
            .query({ limit: 1 })
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
        ).body,
      );
      const second = runsSchema.parse(
        (
          await http()
            .get('/api/v1/admin/sync/runs')
            .query({ limit: 1, cursor: first.nextCursor ?? '' })
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
        ).body,
      );

      expect([...first.data, ...second.data].map((run) => run.id)).toEqual([newer.id, older.id]);
      await http()
        .get('/api/v1/admin/sync/runs')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(403);
    });
  });

  describe('through the queue to the worker', () => {
    let steam: FakeSteam;
    let worker: TestingModule | undefined;

    beforeEach(() => {
      steam = new FakeSteam();
    });

    afterEach(async () => {
      await worker?.close();
      worker = undefined;
      await steam.stop();
    });

    async function waitForRun(runId: string) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const run = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
        if (run.status !== SyncStatus.RUNNING) {
          return run;
        }
        await sleep(100);
      }
      throw new Error(`run ${runId} still RUNNING`);
    }

    it('runs a manual sync in the worker process and records the result', async () => {
      steam.on(801, { kind: 'game', data: steamGame(801) }).on(802, { kind: 'no-data' });
      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [801, 802] });

      const { runId } = startedSchema.parse(
        (
          await http()
            .post('/api/v1/admin/sync')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(202)
        ).body,
      );

      expect(await waitForRun(runId)).toMatchObject({
        status: SyncStatus.SUCCEEDED,
        gamesProcessed: 1,
        gamesFailed: 1,
      });
      await http().get('/api/v1/games/game-801').expect(200);
    });

    it('keeps exactly one daily schedule however many times the worker starts', async () => {
      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });
      await worker.close();
      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });

      const schedulers = await app.get<Queue>(getQueueToken(SYNC_QUEUE)).getJobSchedulers();

      expect(schedulers).toHaveLength(1);
      expect(schedulers[0]).toMatchObject({
        key: DAILY_SYNC_SCHEDULER,
        pattern: DAILY_SYNC_CRON,
        tz: 'UTC',
      });
    });
  });
});

describe('sync jobs and an unavailable queue', () => {
  const prisma = createTestPrismaClient();
  const env = testEnv(liveDependencies());
  let steam: FakeSteam;
  let worker: TestingModule | undefined;

  beforeEach(async () => {
    await resetDatabase(prisma);
    steam = new FakeSteam();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await steam.stop();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function waitUntil(check: () => Promise<boolean>) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await check()) {
        return;
      }
      await sleep(100);
    }
    throw new Error('condition not reached');
  }

  it('answers 503 at once and closes the run when the queue is unreachable', async () => {
    const live = await createTestApp({ config: loadConfig(env) });
    const admin = await registerAndLogin(live);
    await prisma.user.update({
      where: { email: admin.credentials.email },
      data: { role: Role.ADMIN },
    });
    const token = accessTokenFrom(
      await request(live.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: admin.credentials.email, password: admin.credentials.password })
        .expect(200),
    );
    await live.close();
    const down = await createTestApp({
      config: loadConfig({ ...env, REDIS_URL: UNREACHABLE_REDIS_URL }),
    });

    const started = Date.now();
    await request(down.getHttpServer())
      .post('/api/v1/admin/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(503);

    // The enqueue gives up after 2 s (SyncTriggerService) instead of waiting for Redis.
    expect(Date.now() - started).toBeLessThan(3000);
    expect(await prisma.syncRun.findFirstOrThrow()).toMatchObject({
      status: SyncStatus.FAILED,
      runningLock: null,
      errorMessage: 'Could not be queued.',
    });
    await down.close();
  }, 15_000);

  it('fails the job, with the run already FAILED, when the runner hits an unexpected error', async () => {
    worker = await createTestWorker({
      steamBaseUrl: await steam.start(),
      appIds: [],
      loadAppIds: () => Promise.reject(new Error('app id list unreadable')),
    });
    const queue = worker.get<Queue>(getQueueToken(SYNC_QUEUE), { strict: false });

    const job = await queue.add(SYNC_JOB, {});

    await waitUntil(async () => (await job.getState()) === 'failed');
    expect((await queue.getJob(job.id ?? ''))?.failedReason).toBe('app id list unreadable');
    expect(await prisma.syncRun.findFirstOrThrow()).toMatchObject({
      trigger: SyncTrigger.SCHEDULED,
      status: SyncStatus.FAILED,
      errorMessage: 'app id list unreadable',
    });
  });

  it('runs a scheduled job: it creates its own SCHEDULED run', async () => {
    steam.on(811, { kind: 'game', data: steamGame(811) });
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [811] });
    const queue = worker.get<Queue>(getQueueToken(SYNC_QUEUE), { strict: false });

    await queue.add(SYNC_JOB, {});

    await waitUntil(
      async () => (await prisma.syncRun.count({ where: { status: SyncStatus.SUCCEEDED } })) === 1,
    );
    expect(await prisma.syncRun.findFirstOrThrow()).toMatchObject({
      trigger: SyncTrigger.SCHEDULED,
      gamesProcessed: 1,
    });
  });

  it('skips a scheduled job while another run is in progress', async () => {
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });
    const running = await prisma.syncRun.create({
      data: {
        trigger: SyncTrigger.MANUAL,
        status: SyncStatus.RUNNING,
        startedAt: new Date(),
        runningLock: true,
      },
      select: { id: true },
    });
    const queue = worker.get<Queue>(getQueueToken(SYNC_QUEUE), { strict: false });

    const job = await queue.add(SYNC_JOB, {});

    await waitUntil(async () => (await job.isCompleted()) || (await job.isFailed()));
    expect(await job.isCompleted()).toBe(true);
    expect(await prisma.syncRun.findMany({ select: { id: true } })).toEqual([{ id: running.id }]);
  });

  it('skips the job of a run that was closed before the job arrived', async () => {
    steam.on(812, { kind: 'game', data: steamGame(812) });
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [812] });
    const closed = await prisma.syncRun.create({
      data: {
        trigger: SyncTrigger.MANUAL,
        status: SyncStatus.FAILED,
        startedAt: new Date(),
        errorMessage: 'Could not be queued.',
      },
      select: { id: true },
    });
    const queue = worker.get<Queue>(getQueueToken(SYNC_QUEUE), { strict: false });

    const job = await queue.add(SYNC_JOB, { runId: closed.id }, { jobId: closed.id });

    await waitUntil(async () => (await job.isCompleted()) || (await job.isFailed()));
    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: closed.id } })).toMatchObject({
      status: SyncStatus.FAILED,
      gamesProcessed: 0,
    });
    expect(steam.requests).toEqual([]);
  });
});
