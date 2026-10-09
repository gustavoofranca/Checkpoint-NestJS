import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '../src/generated/prisma/client';
import { UserNotFoundError, promoteToAdmin } from '../src/modules/users/promote-to-admin';
import { createTestPrismaClient, createUser, resetDatabase } from './support/database';

describe('promoteToAdmin', () => {
  const prisma = createTestPrismaClient();

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function roleOf(email: string): Promise<Role | undefined> {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    return user?.role;
  }

  it('makes an existing user an admin', async () => {
    await createUser(prisma, { email: 'ana@checkpoint.test', username: 'ana' });

    await expect(promoteToAdmin(prisma, 'ana@checkpoint.test')).resolves.toEqual({
      email: 'ana@checkpoint.test',
      username: 'ana',
    });
    expect(await roleOf('ana@checkpoint.test')).toBe(Role.ADMIN);
  });

  it('matches the email regardless of case and surrounding spaces', async () => {
    await createUser(prisma, { email: 'ana@checkpoint.test' });

    await promoteToAdmin(prisma, '  Ana@Checkpoint.TEST ');

    expect(await roleOf('ana@checkpoint.test')).toBe(Role.ADMIN);
  });

  it('changes no one else', async () => {
    await createUser(prisma, { email: 'ana@checkpoint.test' });
    await createUser(prisma, { email: 'bruno@checkpoint.test' });

    await promoteToAdmin(prisma, 'ana@checkpoint.test');

    expect(await roleOf('bruno@checkpoint.test')).toBe(Role.USER);
  });

  it('is idempotent for an existing admin', async () => {
    await createUser(prisma, { email: 'ana@checkpoint.test', role: Role.ADMIN });

    await expect(promoteToAdmin(prisma, 'ana@checkpoint.test')).resolves.toBeDefined();
    expect(await roleOf('ana@checkpoint.test')).toBe(Role.ADMIN);
  });

  it('fails clearly for an unknown email', async () => {
    await expect(promoteToAdmin(prisma, 'nobody@checkpoint.test')).rejects.toThrow(
      new UserNotFoundError('nobody@checkpoint.test'),
    );
  });
});
