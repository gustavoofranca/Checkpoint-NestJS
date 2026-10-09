import { z } from 'zod';
import { loadDatabaseUrl } from '../config/cli-config';
import { UserNotFoundError, promoteToAdmin } from '../modules/users/promote-to-admin';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { CliUsageError, print, runCli } from './run-cli';

// npm run admin:promote -- <email>
runCli(async () => {
  const email = z.email().safeParse(process.argv[2]);
  if (!email.success) {
    throw new CliUsageError('Usage: npm run admin:promote -- <email>');
  }

  const prisma = createPrismaClient(loadDatabaseUrl(process.env));
  try {
    const user = await promoteToAdmin(prisma, email.data);
    print(`${user.username} <${user.email}> is now ADMIN.`);
  } finally {
    await prisma.$disconnect();
  }
}, [UserNotFoundError]);
