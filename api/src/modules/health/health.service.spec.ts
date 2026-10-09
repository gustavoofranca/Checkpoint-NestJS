import { createServer, type Server } from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/support/test-config';
import type { AppConfig } from '../../config/app-config';
import { ConfigModule } from '../../config/config.module';
import { HealthModule } from './health.module';
import { HealthService } from './health.service';

// Accepts TCP connections and never answers: a dependency that hangs instead of refusing.
async function startSilentServer(): Promise<{ server: Server; port: number }> {
  const server = createServer(() => undefined);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  return { server, port: address.port };
}

describe('HealthService', () => {
  let moduleRef: TestingModule | undefined;
  let silentServer: Server | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    silentServer?.close();
    moduleRef = undefined;
    silentServer = undefined;
  });

  async function resolveHealthService(config: AppConfig): Promise<HealthService> {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(config), HealthModule],
    }).compile();
    moduleRef.useLogger(false);
    await moduleRef.init();
    return moduleRef.get(HealthService);
  }

  it('is resolved through dependency injection with its database and Redis clients', async () => {
    const health = await resolveHealthService(testConfig());

    expect(health).toBeInstanceOf(HealthService);
  });

  it('reports every unreachable dependency with 503', async () => {
    const health = await resolveHealthService(testConfig());

    await expect(health.ensureReady()).rejects.toThrow(
      new ServiceUnavailableException('Unavailable dependencies: database, redis'),
    );
  });

  it('marks a dependency that never answers as down once the probe times out', async () => {
    const silent = await startSilentServer();
    silentServer = silent.server;
    const health = await resolveHealthService(
      testConfig({ REDIS_URL: `redis://127.0.0.1:${String(silent.port)}` }),
    );

    await expect(health.ensureReady()).rejects.toThrow('Unavailable dependencies: database, redis');
  });
});
