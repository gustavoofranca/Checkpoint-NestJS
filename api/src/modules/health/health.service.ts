import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { DependencyStatus, ReadinessResponse } from './dto/health-response.dto';

// A readiness probe must answer quickly even when a dependency hangs instead of refusing.
const PROBE_TIMEOUT_MS = 1_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async ensureReady(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
    ]);
    const checks = { database, redis };

    const unavailable = Object.entries(checks)
      .filter(([, status]) => status === 'down')
      .map(([name]) => name);
    if (unavailable.length > 0) {
      throw new ServiceUnavailableException(`Unavailable dependencies: ${unavailable.join(', ')}`);
    }
    return { status: 'ok', checks };
  }

  private async probe(name: string, check: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await withTimeout(check(), PROBE_TIMEOUT_MS);
      return 'up';
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Readiness probe for ${name} failed: ${reason}`);
      return 'down';
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
