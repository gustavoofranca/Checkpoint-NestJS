import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GamesService } from '../games/games.service';
import { slugForNewGame, upsertGenres, writeGame } from './catalog-writer';
import { loadCuratedAppIds } from './data-files';
import { SteamClient, SteamUnavailableError } from './steam/steam-client';
import { type SyncCounts, SyncRunsService } from './sync-runs.service';

export interface SyncOptions {
  // Pause between two Steam requests. 2 s is 150 requests in 5 minutes, well under the roughly
  // 200 that Steam tolerates (docs/adr/0009).
  requestIntervalMs: number;
  loadAppIds: () => Promise<number[]>;
}

export const SYNC_OPTIONS = Symbol('SYNC_OPTIONS');

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  requestIntervalMs: 2_000,
  loadAppIds: () => loadCuratedAppIds(),
};

// One pass over the curated list, one game at a time. A game Steam has no data for, or whose data
// fails validation, is counted and skipped: one bad game never fails the run. Steam being
// unreachable after the client's retries stops the run, which is recorded as FAILED.
@Injectable()
export class SyncRunner {
  private readonly logger = new Logger(SyncRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly steam: SteamClient,
    private readonly runs: SyncRunsService,
    private readonly games: GamesService,
    @Inject(SYNC_OPTIONS) private readonly options: SyncOptions,
  ) {}

  async run(runId: string): Promise<SyncCounts> {
    const counts: SyncCounts = { gamesProcessed: 0, gamesFailed: 0 };
    const syncedAt = new Date();
    try {
      const appIds = await this.options.loadAppIds();
      for (const [index, appId] of appIds.entries()) {
        if (index > 0) {
          await sleep(this.options.requestIntervalMs);
        }
        await this.syncOne(appId, syncedAt, counts);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync run ${runId} failed: ${reason}`);
      await this.runs.fail(runId, counts, reason);
      await this.invalidateIfChanged(counts);
      if (error instanceof SteamUnavailableError) {
        return counts;
      }
      throw error;
    }
    await this.runs.succeed(runId, counts);
    await this.invalidateIfChanged(counts);
    this.logger.log(
      `Sync run ${runId} succeeded: ${String(counts.gamesProcessed)} written, ${String(counts.gamesFailed)} skipped`,
    );
    return counts;
  }

  private async syncOne(appId: number, syncedAt: Date, counts: SyncCounts): Promise<void> {
    const result = await this.steam.fetchAppDetails(appId);
    if (result.outcome === 'rejected') {
      counts.gamesFailed += 1;
      this.logger.warn(`Skipped app ${String(appId)}: ${result.reason}`);
      return;
    }
    try {
      const genreIds = await upsertGenres(this.prisma, result.game.genres);
      const slugIfNew = await slugForNewGame(this.prisma, result.game);
      await writeGame(this.prisma, result.game, { syncedAt, slugIfNew, genreIds });
      counts.gamesProcessed += 1;
    } catch (error) {
      counts.gamesFailed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not write app ${String(appId)}: ${reason}`);
    }
  }

  // The cache is invalidated once at the end, after every write is committed (docs/adr/0007).
  private async invalidateIfChanged(counts: SyncCounts): Promise<void> {
    if (counts.gamesProcessed > 0) {
      await this.games.invalidateCatalog();
    }
  }
}
