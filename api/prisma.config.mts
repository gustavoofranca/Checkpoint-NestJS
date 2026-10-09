import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env files. Load the repository's one when present; variables
// already set (CI, containers) win, because loadEnvFile does not override them.
const rootEnvFile = join(import.meta.dirname, '..', '.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Read without prisma's env() helper, which throws when the variable is missing: `prisma generate`
// needs no database and must run in CI before one exists. Commands that do need it fail on their own.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url === undefined ? {} : { datasource: { url } }),
});
