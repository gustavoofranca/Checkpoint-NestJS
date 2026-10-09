import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { toTestDatabaseUrl } from './test/support/test-database-url.js';

// e2e tests reach PostgreSQL and Redis through DATABASE_URL and REDIS_URL. Locally they come from
// the repository's .env; in CI from the job environment, which loadEnvFile does not override.
const rootEnvFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Every test process, the global setup included, sees the test database, never the dev one.
if (process.env.DATABASE_URL !== undefined) {
  process.env.DATABASE_URL = toTestDatabaseUrl(process.env.DATABASE_URL);
}

// Nest resolves constructor dependencies from decorator metadata. Vitest transforms TypeScript
// with Oxc, which emits it because tsconfig.json sets emitDecoratorMetadata (docs/adr/0001).
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          setupFiles: ['test/support/e2e-setup.ts'],
          // e2e files share one database; running them one at a time keeps resets from racing.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entry points: they parse argv and env, then call tested functions.
      exclude: ['src/main.ts', 'src/cli/**', 'src/generated/**', 'src/**/*.spec.ts'],
      thresholds: { lines: 85, branches: 85 },
    },
  },
});
