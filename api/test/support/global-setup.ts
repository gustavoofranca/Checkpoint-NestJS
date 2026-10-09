import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Runs once before the e2e project. vitest.config.mts has already pointed DATABASE_URL at the
// test database; `migrate deploy` creates it when missing and applies pending migrations.
export default function setup(): void {
  if (process.env.DATABASE_URL === undefined) {
    throw new Error('DATABASE_URL must be set to run the e2e tests');
  }
  execFileSync(join(process.cwd(), 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
}
