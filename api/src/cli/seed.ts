import { readFile } from 'node:fs/promises';
import { loadSeedConfig } from '../config/cli-config';
import { PasswordHasher } from '../modules/users/password-hasher';
import { catalogSnapshotSchema } from '../modules/sync/catalog-game';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { seedDatabase } from '../prisma/seed-database';
import { SNAPSHOT_FILE } from './data-files';
import { print, runCli } from './run-cli';

// npm run db:seed. Loads the bundled Steam snapshot and the demo users; safe to run repeatedly.
runCli(async () => {
  const config = loadSeedConfig(process.env);
  const snapshot = catalogSnapshotSchema.parse(JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')));
  const demoPasswordHash = await new PasswordHasher().hash(config.demoPassword);

  const prisma = createPrismaClient(config.databaseUrl);
  try {
    const report = await seedDatabase(prisma, snapshot, demoPasswordHash);
    print(
      `Seeded ${String(report.games)} games and ${String(report.genres)} genres; ` +
        `created ${String(report.demoUsersCreated)} demo users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
});
