import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { decodeCursor } from '../../common/pagination/cursor';
import { type Page, toPage } from '../../common/pagination/page';
import type { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { Prisma, SyncStatus, type SyncTrigger } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SyncRunDto } from './dto/sync-run.dto';

const ERROR_MESSAGE_MAX = 500;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('A catalog sync is already running.');
    this.name = 'SyncAlreadyRunningError';
  }
}

export interface SyncCounts {
  gamesProcessed: number;
  gamesFailed: number;
}

const RUN_SELECT = {
  id: true,
  trigger: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  gamesProcessed: true,
  gamesFailed: true,
  errorMessage: true,
} as const satisfies Prisma.SyncRunSelect;

const runCursorSchema = z.object({ startedAt: z.iso.datetime(), id: z.uuid() });

// The lifecycle of a SyncRun row. Only one can be RUNNING: the unique running_lock column decides,
// so two concurrent starts cannot both succeed (docs/adr/0010).
@Injectable()
export class SyncRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(trigger: SyncTrigger): Promise<string> {
    try {
      const run = await this.prisma.syncRun.create({
        data: { trigger, status: SyncStatus.RUNNING, startedAt: new Date(), runningLock: true },
        select: { id: true },
      });
      return run.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SyncAlreadyRunningError();
      }
      throw error;
    }
  }

  async isRunning(id: string): Promise<boolean> {
    const run = await this.prisma.syncRun.findUnique({ where: { id }, select: { status: true } });
    return run?.status === SyncStatus.RUNNING;
  }

  async succeed(id: string, counts: SyncCounts): Promise<void> {
    await this.finish(id, SyncStatus.SUCCEEDED, counts, null);
  }

  async fail(id: string, counts: SyncCounts, reason: string): Promise<void> {
    await this.finish(id, SyncStatus.FAILED, counts, reason);
  }

  // A worker that stopped mid-run leaves its row RUNNING, which would block every later sync. With
  // a single worker process, anything RUNNING when it starts was interrupted.
  async failInterrupted(): Promise<number> {
    const result = await this.prisma.syncRun.updateMany({
      where: { status: SyncStatus.RUNNING },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        runningLock: null,
        errorMessage: 'Interrupted: the worker stopped during the run.',
      },
    });
    return result.count;
  }

  async list(query: PaginationQueryDto): Promise<Page<SyncRunDto>> {
    const cursor =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor, runCursorSchema);
    const rows = await this.prisma.syncRun.findMany({
      where:
        cursor === undefined
          ? {}
          : {
              startedAt: { lte: new Date(cursor.startedAt) },
              OR: [{ startedAt: { lt: new Date(cursor.startedAt) } }, { id: { lt: cursor.id } }],
            },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: RUN_SELECT,
    });
    return toPage(
      rows,
      query.limit,
      (row) => ({ startedAt: row.startedAt.toISOString(), id: row.id }),
      (row) => row,
    );
  }

  private async finish(
    id: string,
    status: SyncStatus,
    counts: SyncCounts,
    reason: string | null,
  ): Promise<void> {
    await this.prisma.syncRun.update({
      where: { id },
      data: {
        status,
        finishedAt: new Date(),
        runningLock: null,
        gamesProcessed: counts.gamesProcessed,
        gamesFailed: counts.gamesFailed,
        errorMessage: reason === null ? null : reason.slice(0, ERROR_MESSAGE_MAX),
      },
    });
  }
}
