import type { TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyncStatus, SyncTrigger } from '../src/generated/prisma/client';
import { GamesService } from '../src/modules/games/games.service';
import { SyncRunner } from '../src/modules/sync/sync-runner.service';
import { SyncAlreadyRunningError, SyncRunsService } from '../src/modules/sync/sync-runs.service';
import {
  createGame,
  createTestPrismaClient,
  resetDatabase,
  violatedConstraint,
} from './support/database';
import { createTestWorker } from './support/create-test-worker';
import { FakeSteam, steamGame } from './support/fake-steam';

describe('catalog sync', () => {
  const prisma = createTestPrismaClient();
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

  async function runSync(appIds: number[]) {
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds });
    const runId = await worker.get(SyncRunsService).start(SyncTrigger.MANUAL);
    await worker.get(SyncRunner).run(runId);
    return prisma.syncRun.findUniqueOrThrow({ where: { id: runId } });
  }

  it('writes every game and records a successful run', async () => {
    steam
      .on(101, {
        kind: 'game',
        data: steamGame(101, { genres: [{ description: 'Action' }, { description: 'Indie' }] }),
      })
      .on(102, { kind: 'game', data: steamGame(102) })
      .on(103, {
        kind: 'game',
        data: steamGame(103, { is_free: true, price_overview: undefined }),
      });

    const run = await runSync([101, 102, 103]);

    expect(run).toMatchObject({
      status: SyncStatus.SUCCEEDED,
      gamesProcessed: 3,
      gamesFailed: 0,
      runningLock: null,
      errorMessage: null,
    });
    expect(run.finishedAt).not.toBeNull();
    const games = await prisma.game.findMany({
      select: { steamAppId: true, slug: true, isFree: true, priceCents: true },
      orderBy: { steamAppId: 'asc' },
    });
    expect(games).toEqual([
      { steamAppId: 101, slug: 'game-101', isFree: false, priceCents: 1999 },
      { steamAppId: 102, slug: 'game-102', isFree: false, priceCents: 1999 },
      { steamAppId: 103, slug: 'game-103', isFree: true, priceCents: null },
    ]);
    expect(await prisma.genre.count()).toBe(2);
  });

  it('counts and skips bad games without failing the run', async () => {
    steam
      .on(201, { kind: 'game', data: steamGame(201) })
      .on(202, { kind: 'no-data' })
      .on(203, { kind: 'body', body: 'not json' })
      .on(204, {
        kind: 'game',
        data: steamGame(204, { header_image: 'https://evil.example/h.jpg' }),
      })
      .on(205, { kind: 'game', data: steamGame(205, { type: 'dlc' }) })
      .on(206, { kind: 'game', data: steamGame(206, { name: '<b>Clean</b> &amp; Safe' }) });

    const run = await runSync([201, 202, 203, 204, 205, 206]);

    expect(run).toMatchObject({ status: SyncStatus.SUCCEEDED, gamesProcessed: 2, gamesFailed: 4 });
    expect(
      await prisma.game.findUnique({ where: { steamAppId: 206 }, select: { title: true } }),
    ).toEqual({
      title: 'Clean & Safe',
    });
  });

  it('retries after a 429 and writes the game', async () => {
    steam.on(301, { kind: 'status', status: 429 }, { kind: 'game', data: steamGame(301) });

    const run = await runSync([301]);

    expect(run).toMatchObject({ status: SyncStatus.SUCCEEDED, gamesProcessed: 1, gamesFailed: 0 });
    expect(steam.requests).toEqual([301, 301]);
  });

  it('marks the run FAILED when Steam is down, keeping what was written before', async () => {
    steam.on(401, { kind: 'game', data: steamGame(401) }).on(402, { kind: 'status', status: 503 });

    const run = await runSync([401, 402, 403]);

    expect(run).toMatchObject({ status: SyncStatus.FAILED, gamesProcessed: 1, runningLock: null });
    expect(run.errorMessage).toMatch(/^Steam unavailable at app 402: HTTP 503/);
    expect(steam.requests).not.toContain(403);
    expect(await prisma.game.count()).toBe(1);
  });

  it('gives a new game whose slug is taken a slug with its app id', async () => {
    await createGame(prisma, { steamAppId: 999, slug: 'hades', title: 'Hades' });
    steam.on(1145360, { kind: 'game', data: steamGame(1145360, { name: 'Hades' }) });

    await runSync([1145360]);

    expect(
      await prisma.game.findUnique({ where: { steamAppId: 1145360 }, select: { slug: true } }),
    ).toEqual({
      slug: 'hades-1145360',
    });
  });

  it('refreshes an existing game but keeps its slug and rating', async () => {
    await createGame(prisma, {
      steamAppId: 601,
      slug: 'old-slug',
      ratingAverage: 4.5,
      ratingCount: 2,
    });
    steam.on(601, { kind: 'game', data: steamGame(601, { name: 'Renamed On Steam' }) });

    await runSync([601]);

    const game = await prisma.game.findUniqueOrThrow({
      where: { steamAppId: 601 },
      select: { title: true, slug: true, ratingAverage: true, ratingCount: true },
    });
    expect(game).toMatchObject({ title: 'Renamed On Steam', slug: 'old-slug', ratingCount: 2 });
    expect(game.ratingAverage.toString()).toBe('4.5');
  });

  it('invalidates the catalog cache when the run ends', async () => {
    await createGame(prisma, { steamAppId: 701, slug: 'cached-game', title: 'Before' });
    steam.on(701, { kind: 'game', data: steamGame(701, { name: 'After' }) });
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [701] });
    const games = worker.get(GamesService, { strict: false });
    expect((await games.findBySlug('cached-game')).title).toBe('Before');

    await worker.get(SyncRunner).run(await worker.get(SyncRunsService).start(SyncTrigger.MANUAL));

    expect((await games.findBySlug('cached-game')).title).toBe('After');
  });

  describe('one run at a time', () => {
    it('refuses to start a second run while one is RUNNING', async () => {
      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });
      const runs = worker.get(SyncRunsService);
      await runs.start(SyncTrigger.MANUAL);

      await expect(runs.start(SyncTrigger.SCHEDULED)).rejects.toThrow(SyncAlreadyRunningError);
    });

    it('lets only one of two simultaneous starts succeed', async () => {
      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });
      const runs = worker.get(SyncRunsService);

      const results = await Promise.allSettled([
        runs.start(SyncTrigger.MANUAL),
        runs.start(SyncTrigger.MANUAL),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    });

    it('is enforced by the database: running_lock must match the status', async () => {
      expect(
        await violatedConstraint(
          prisma.syncRun.create({
            data: {
              trigger: SyncTrigger.MANUAL,
              status: SyncStatus.SUCCEEDED,
              startedAt: new Date(),
              runningLock: true,
            },
          }),
        ),
      ).toBe('sync_runs_running_lock_check');
    });

    it('marks runs left RUNNING by a stopped worker as FAILED when a worker starts', async () => {
      const left = await prisma.syncRun.create({
        data: {
          trigger: SyncTrigger.SCHEDULED,
          status: SyncStatus.RUNNING,
          startedAt: new Date(),
          runningLock: true,
        },
        select: { id: true },
      });

      worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [] });

      expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: left.id } })).toMatchObject({
        status: SyncStatus.FAILED,
        runningLock: null,
        errorMessage: 'Interrupted: the worker stopped during the run.',
      });
    });
  });
});

describe('catalog sync failure handling', () => {
  const prisma = createTestPrismaClient();
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

  it('records an unexpected error as FAILED and rethrows it for the job', async () => {
    worker = await createTestWorker({
      steamBaseUrl: await steam.start(),
      appIds: [],
      loadAppIds: () => Promise.reject(new Error('app id list unreadable')),
    });
    const runId = await worker.get(SyncRunsService).start(SyncTrigger.MANUAL);

    await expect(worker.get(SyncRunner).run(runId)).rejects.toThrow('app id list unreadable');

    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: SyncStatus.FAILED,
      errorMessage: 'app id list unreadable',
    });
  });

  it('counts a game that cannot be written and goes on with the next', async () => {
    steam
      .on(901, { kind: 'game', data: steamGame(901, { genres: [{ description: '冒険' }] }) })
      .on(902, { kind: 'game', data: steamGame(902) });
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [901, 902] });
    const runId = await worker.get(SyncRunsService).start(SyncTrigger.MANUAL);

    await worker.get(SyncRunner).run(runId);

    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: SyncStatus.SUCCEEDED,
      gamesProcessed: 1,
      gamesFailed: 1,
    });
  });

  it('slugs a title without Latin letters by app id and keeps an unknown release date', async () => {
    steam.on(903, {
      kind: 'game',
      data: steamGame(903, {
        name: '原神',
        release_date: { coming_soon: true, date: 'Coming soon' },
      }),
    });
    worker = await createTestWorker({ steamBaseUrl: await steam.start(), appIds: [903] });

    await worker.get(SyncRunner).run(await worker.get(SyncRunsService).start(SyncTrigger.MANUAL));

    expect(
      await prisma.game.findUnique({
        where: { steamAppId: 903 },
        select: { slug: true, releaseDate: true },
      }),
    ).toEqual({ slug: 'app-903', releaseDate: null });
  });
});
