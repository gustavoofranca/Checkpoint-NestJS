import { randomBytes } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncStatus, SyncTrigger } from '../src/generated/prisma/client';
import { SYNC_JOB, SYNC_QUEUE } from '../src/modules/sync/sync-queue';
import { registerAndLogin } from './support/auth';
import { createTestApp } from './support/create-test-app';
import { createGame, createTestPrismaClient, resetDatabase } from './support/database';
import { liveDependencies, testConfig } from './support/test-config';

const METRICS_TOKEN = randomBytes(32).toString('hex');

// The value of one series in Prometheus text format, or undefined when it is absent.
function sample(
  text: string,
  name: string,
  labels: Record<string, string> = {},
): number | undefined {
  const wanted = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
  for (const line of text.split('\n')) {
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})? (\S+)$/.exec(line);
    if (match?.[1] !== name) {
      continue;
    }
    const present = (match[2] ?? '').split(',');
    if (wanted.every((pair) => present.includes(pair))) {
      return Number(match[3]);
    }
  }
  return undefined;
}

describe('metrics', () => {
  const prisma = createTestPrismaClient();
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const scrape = async () =>
    (
      await http()
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${METRICS_TOKEN}`)
        .expect(200)
    ).text;

  beforeAll(async () => {
    app = await createTestApp({ config: testConfig({ ...liveDependencies(), METRICS_TOKEN }) });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('access', () => {
    it('answers 401 without a token, with a wrong token and with a user access token', async () => {
      const { accessToken } = await registerAndLogin(app);

      await http().get('/api/v1/metrics').expect(401);
      await http()
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${randomBytes(32).toString('hex')}`)
        .expect(401);
      const asUser = await http()
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      expect(asUser.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(asUser.text).not.toContain('http_request_duration_seconds');
    });

    it('answers Prometheus text with the token', async () => {
      const response = await http()
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${METRICS_TOKEN}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/^text\/plain;.*version=0\.0\.4/);
      expect(response.text).toContain('# TYPE http_request_duration_seconds histogram');
      expect(sample(response.text, 'process_cpu_user_seconds_total')).toBeGreaterThan(0);
    });
  });

  it('measures requests by route pattern and status code, never by raw URL', async () => {
    await http().get('/api/v1/games/no-such-game').expect(404);
    await http().get('/api/v1/games/no-such-game').expect(404);

    const text = await scrape();

    expect(
      sample(text, 'http_request_duration_seconds_count', {
        method: 'GET',
        route: '/api/v1/games/:slug',
        status_code: '404',
      }),
    ).toBe(2);
    expect(text).not.toContain('no-such-game');
  });

  it('counts catalog cache hits and misses', async () => {
    await createGame(prisma, { slug: 'cached-game' });
    const before = await scrape();
    await http().get('/api/v1/games/cached-game').expect(200);
    await http().get('/api/v1/games/cached-game').expect(200);

    const after = await scrape();

    const delta = (result: string) =>
      (sample(after, 'checkpoint_cache_requests_total', { result }) ?? 0) -
      (sample(before, 'checkpoint_cache_requests_total', { result }) ?? 0);
    expect(delta('miss')).toBe(1);
    expect(delta('hit')).toBe(1);
  });

  it('reports sync runs from the database', async () => {
    const finishedAt = new Date('2026-10-13T04:00:30Z');
    await prisma.syncRun.createMany({
      data: [
        {
          trigger: SyncTrigger.SCHEDULED,
          status: SyncStatus.FAILED,
          startedAt: new Date('2026-10-12T04:00:00Z'),
          finishedAt: new Date('2026-10-12T04:01:00Z'),
        },
        {
          trigger: SyncTrigger.SCHEDULED,
          status: SyncStatus.SUCCEEDED,
          startedAt: new Date('2026-10-13T04:00:00Z'),
          finishedAt,
        },
        {
          trigger: SyncTrigger.MANUAL,
          status: SyncStatus.RUNNING,
          startedAt: new Date(),
          runningLock: true,
        },
      ],
    });

    const text = await scrape();

    expect(sample(text, 'checkpoint_sync_runs_total', { status: 'succeeded' })).toBe(1);
    expect(sample(text, 'checkpoint_sync_runs_total', { status: 'failed' })).toBe(1);
    expect(sample(text, 'checkpoint_sync_running')).toBe(1);
    expect(sample(text, 'checkpoint_sync_last_run_duration_seconds', { status: 'succeeded' })).toBe(
      30,
    );
    expect(sample(text, 'checkpoint_sync_last_success_timestamp_seconds')).toBe(
      finishedAt.getTime() / 1000,
    );
  });

  it('reports no last run before any sync has finished', async () => {
    const text = await scrape();

    expect(sample(text, 'checkpoint_sync_runs_total', { status: 'succeeded' })).toBe(0);
    expect(sample(text, 'checkpoint_sync_running')).toBe(0);
    expect(sample(text, 'checkpoint_sync_last_run_duration_seconds')).toBeUndefined();
    expect(sample(text, 'checkpoint_sync_last_success_timestamp_seconds')).toBe(0);
    expect(sample(text, 'checkpoint_metrics_source_up', { source: 'sync_runs' })).toBe(1);
    expect(sample(text, 'checkpoint_metrics_source_up', { source: 'sync_queue' })).toBe(1);
  });

  it('reports the depth of the sync queue', async () => {
    await app.get<Queue>(getQueueToken(SYNC_QUEUE)).add(SYNC_JOB, {});

    const text = await scrape();

    expect(sample(text, 'checkpoint_sync_queue_jobs', { state: 'waiting' })).toBe(1);
    expect(sample(text, 'checkpoint_sync_queue_jobs', { state: 'failed' })).toBe(0);
  });
});

describe('metrics without their dependencies', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('answers 404 when METRICS_TOKEN is not configured', async () => {
    app = await createTestApp();

    await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('Authorization', `Bearer ${METRICS_TOKEN}`)
      .expect(404);
  });

  it('still answers, and reports its sources down, when PostgreSQL and Redis are down', async () => {
    app = await createTestApp({ config: testConfig({ METRICS_TOKEN }) });
    const started = Date.now();

    const response = await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('Authorization', `Bearer ${METRICS_TOKEN}`)
      .expect(200);

    expect(Date.now() - started).toBeLessThan(3000);
    expect(response.text).toContain('# TYPE http_request_duration_seconds histogram');
    expect(sample(response.text, 'checkpoint_metrics_source_up', { source: 'sync_runs' })).toBe(0);
    expect(sample(response.text, 'checkpoint_metrics_source_up', { source: 'sync_queue' })).toBe(0);
    expect(
      sample(response.text, 'checkpoint_sync_runs_total', { status: 'failed' }),
    ).toBeUndefined();
    expect(
      sample(response.text, 'checkpoint_sync_queue_jobs', { state: 'waiting' }),
    ).toBeUndefined();
  }, 15_000);
});
