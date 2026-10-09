import { Prisma, type PrismaClient, Role } from '../../generated/prisma/client';

export class UserNotFoundError extends Error {
  constructor(email: string) {
    super(`No user with email ${email}`);
    this.name = 'UserNotFoundError';
  }
}

// There is no HTTP route that grants ADMIN (docs/SPEC.md, Roles). This runs only from the CLI,
// by someone with access to the database credentials.
export async function promoteToAdmin(
  prisma: PrismaClient,
  email: string,
): Promise<{ email: string; username: string }> {
  const normalized = email.trim().toLowerCase();
  try {
    return await prisma.user.update({
      where: { email: normalized },
      data: { role: Role.ADMIN },
      select: { email: true, username: true },
    });
  } catch (error) {
    // P2025: the record to update was not found.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new UserNotFoundError(normalized);
    }
    throw error;
  }
}
