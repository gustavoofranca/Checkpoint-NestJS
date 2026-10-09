import { PrismaClient } from '../../src/generated/prisma/client';
import { createPrismaAdapter } from '../../src/prisma/create-prisma-client';

export interface QueryCountingPrisma {
  client: PrismaClient<'query'>;
  statements: string[];
}

// A real client with Prisma's query event turned on, to count the SQL statements an endpoint
// sends. Used in place of PrismaService; nothing is stubbed.
export function createQueryCountingPrisma(databaseUrl: string): QueryCountingPrisma {
  const client = new PrismaClient({
    adapter: createPrismaAdapter(databaseUrl),
    log: [{ emit: 'event', level: 'query' }],
  });
  const statements: string[] = [];
  client.$on('query', (event) => {
    statements.push(event.query);
  });
  return { client, statements };
}
