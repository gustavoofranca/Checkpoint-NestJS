import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const CONNECTION_TIMEOUT_MS = 5_000;

export function createPrismaAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
}

// For processes outside Nest: the CLIs and the tests that talk to the database directly.
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
}
