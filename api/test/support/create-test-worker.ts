import { Test, type TestingModule } from '@nestjs/testing';
import type { AppConfig } from '../../src/config/app-config';
import { ConfigModule } from '../../src/config/config.module';
import { BullRootModule } from '../../src/modules/sync/bull-root.module';
import { STEAM_CLIENT_OPTIONS } from '../../src/modules/sync/steam/steam-client';
import { SYNC_OPTIONS } from '../../src/modules/sync/sync-runner.service';
import { SyncWorkerModule } from '../../src/modules/sync/sync-worker.module';
import { liveDependencies, testConfig } from './test-config';

interface TestWorkerOptions {
  steamBaseUrl: string;
  appIds: number[];
  config?: AppConfig;
  // Replaces the app id loader entirely, for instance to make it fail.
  loadAppIds?: () => Promise<number[]>;
}

// The real worker (BullMQ consumer, processor, scheduler, runner) wired like src/worker.ts, with
// Steam pointed at a FakeSteam and the curated list replaced by the test's app ids.
export async function createTestWorker(options: TestWorkerOptions): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot(options.config ?? testConfig(liveDependencies())),
      BullRootModule,
      SyncWorkerModule,
    ],
  })
    .overrideProvider(STEAM_CLIENT_OPTIONS)
    .useValue({
      baseUrl: options.steamBaseUrl,
      requestTimeoutMs: 500,
      maxResponseBytes: 1024 * 1024,
      retryDelaysMs: [10, 10],
    })
    .overrideProvider(SYNC_OPTIONS)
    .useValue({
      requestIntervalMs: 0,
      loadAppIds: options.loadAppIds ?? (() => Promise.resolve(options.appIds)),
    })
    .compile();
  moduleRef.useLogger(false);
  await moduleRef.init();
  return moduleRef;
}
