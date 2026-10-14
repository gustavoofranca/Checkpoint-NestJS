import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import { withTimeout } from '../../common/async/with-timeout';
import { routePattern } from '../../common/http/route-pattern';
import { CacheService } from '../../redis/cache.service';
import { SYNC_QUEUE } from '../sync/sync-queue';
import { type SyncRunStats, SyncRunsService } from '../sync/sync-runs.service';

const QUEUE_COUNT_TIMEOUT_MS = 1_000;
const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

type QueueCounts = Record<string, number>;
type ScrapeRead<T> = () => Promise<T | undefined>;

// The Prometheus registry of the API process (docs/adr/0011). Its own registry rather than the
// library's global one, so every app instance (tests create several) starts from zero.
//
// Sync and queue values are read from PostgreSQL and Redis when Prometheus scrapes. A source that
// cannot answer is reported by checkpoint_metrics_source_up and the rest is still served.
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly logger = new Logger(MetricsService.name);

  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests, by route pattern and status code.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  constructor(cache: CacheService, runs: SyncRunsService, @InjectQueue(SYNC_QUEUE) queue: Queue) {
    collectDefaultMetrics({ register: this.registry });
    const syncRuns = this.oncePerScrape('sync_runs', () => runs.stats());
    const queueCounts = this.oncePerScrape('sync_queue', () =>
      // BullMQ waits for its Redis connection before any command, so the wait is bounded.
      withTimeout(queue.getJobCounts(...QUEUE_STATES), QUEUE_COUNT_TIMEOUT_MS),
    );
    this.registerCacheMetrics(cache);
    this.registerSyncMetrics(syncRuns);
    this.registerQueueMetrics(queueCounts);
    this.registerSourceMetrics({ sync_runs: syncRuns, sync_queue: queueCounts });
  }

  // Express middleware, registered before routing so every response is measured, rejected ones
  // included. Requests that matched no route share one label value.
  readonly observeHttpRequest = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const stop = this.httpDuration.startTimer();
    response.once('finish', () => {
      stop({
        method: request.method,
        route: routePattern(request) ?? 'unmatched',
        status_code: String(response.statusCode),
      });
    });
    next();
  };

  private registerCacheMetrics(cache: CacheService): void {
    new Counter({
      name: 'checkpoint_cache_requests_total',
      help: 'Catalog cache lookups, by result.',
      labelNames: ['result'] as const,
      registers: [this.registry],
      collect() {
        const { hits, misses } = cache.stats();
        this.reset();
        this.inc({ result: 'hit' }, hits);
        this.inc({ result: 'miss' }, misses);
      },
    });
  }

  private registerSyncMetrics(syncRuns: ScrapeRead<SyncRunStats>): void {
    new Counter({
      name: 'checkpoint_sync_runs_total',
      help: 'Finished catalog sync runs, by outcome.',
      labelNames: ['status'] as const,
      registers: [this.registry],
      async collect() {
        this.reset();
        const stats = await syncRuns();
        if (stats !== undefined) {
          this.inc({ status: 'succeeded' }, stats.finished.succeeded);
          this.inc({ status: 'failed' }, stats.finished.failed);
        }
      },
    });
    new Gauge({
      name: 'checkpoint_sync_running',
      help: '1 while a catalog sync run is in progress.',
      registers: [this.registry],
      async collect() {
        this.set((await syncRuns())?.running === true ? 1 : 0);
      },
    });
    new Gauge({
      name: 'checkpoint_sync_last_run_duration_seconds',
      help: 'Duration of the last finished catalog sync run, labelled with its outcome.',
      labelNames: ['status'] as const,
      registers: [this.registry],
      async collect() {
        this.reset();
        const last = (await syncRuns())?.lastFinished;
        if (last !== undefined && last !== null) {
          this.set({ status: last.succeeded ? 'succeeded' : 'failed' }, last.durationSeconds);
        }
      },
    });
    new Gauge({
      name: 'checkpoint_sync_last_success_timestamp_seconds',
      help: 'Unix time at which the last successful catalog sync run finished; 0 if none has.',
      registers: [this.registry],
      async collect() {
        const at = (await syncRuns())?.lastSucceededAt;
        this.set(at === undefined || at === null ? 0 : at.getTime() / 1000);
      },
    });
  }

  private registerQueueMetrics(queueCounts: ScrapeRead<QueueCounts>): void {
    new Gauge({
      name: 'checkpoint_sync_queue_jobs',
      help: 'Jobs in the catalog sync queue, by state.',
      labelNames: ['state'] as const,
      registers: [this.registry],
      async collect() {
        this.reset();
        const counts = await queueCounts();
        if (counts !== undefined) {
          for (const state of QUEUE_STATES) {
            this.set({ state }, counts[state] ?? 0);
          }
        }
      },
    });
  }

  private registerSourceMetrics(sources: Record<string, ScrapeRead<unknown>>): void {
    new Gauge({
      name: 'checkpoint_metrics_source_up',
      help: '1 if the source answered during this scrape; 0 if its metrics were skipped.',
      labelNames: ['source'] as const,
      registers: [this.registry],
      async collect() {
        for (const [source, read] of Object.entries(sources)) {
          this.set({ source }, (await read()) === undefined ? 0 : 1);
        }
      },
    });
  }

  // The registry collects every metric at once, so the metrics fed by one source share a single
  // read per scrape. A failure is logged once and reads as undefined.
  private oncePerScrape<T>(source: string, read: () => Promise<T>): ScrapeRead<T> {
    let pending: Promise<T | undefined> | undefined;
    return () => {
      pending ??= this.readOrSkip(source, read).finally(() => {
        pending = undefined;
      });
      return pending;
    };
  }

  private async readOrSkip<T>(source: string, read: () => Promise<T>): Promise<T | undefined> {
    try {
      return await read();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Metrics from ${source} skipped: ${reason}`);
      return undefined;
    }
  }
}
