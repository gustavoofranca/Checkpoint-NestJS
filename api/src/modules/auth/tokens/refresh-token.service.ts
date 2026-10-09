import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const REFRESH_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  // Sent to the client once, in the cookie. Only its SHA-256 is stored.
  token: string;
  expiresAt: Date;
}

export type RotationResult =
  | { outcome: 'rotated'; user: AuthenticatedUser; refreshToken: IssuedRefreshToken }
  | { outcome: 'rejected' };

type Db = Prisma.TransactionClient;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Opaque refresh tokens, rotated on every use. A rotated token presented again means it leaked
// (or the client misbehaved), so the whole family is revoked (docs/adr/0004).
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Starts a new family: one per sign-in.
  async issue(userId: string): Promise<IssuedRefreshToken> {
    const { token, expiresAt } = await this.create(this.prisma, userId, randomUUID());
    return { token, expiresAt };
  }

  rotate(presented: string): Promise<RotationResult> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(presented) },
        select: { id: true, familyId: true, user: { select: { id: true, role: true } } },
      });
      if (current === null) {
        return { outcome: 'rejected' };
      }

      // Claims the token atomically. With two concurrent refreshes, PostgreSQL makes the second
      // UPDATE wait for the first and then re-check the WHERE clause, so only one can match.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (claimed.count === 0) {
        await this.rejectUnclaimable(tx, current.id, current.familyId, now);
        return { outcome: 'rejected' };
      }

      const next = await this.create(tx, current.user.id, current.familyId);
      await tx.refreshToken.update({
        where: { id: current.id },
        data: { replacedById: next.id },
      });
      return {
        outcome: 'rotated',
        user: current.user,
        refreshToken: { token: next.token, expiresAt: next.expiresAt },
      };
    });
  }

  async revokeFamilyOf(presented: string): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { familyId: true },
    });
    if (token !== null) {
      await this.revokeFamily(this.prisma, token.familyId, new Date());
    }
  }

  // Fresh read: under READ COMMITTED it sees a revocation committed by a concurrent rotation.
  private async rejectUnclaimable(tx: Db, id: string, familyId: string, now: Date) {
    const token = await tx.refreshToken.findUniqueOrThrow({
      where: { id },
      select: { revokedAt: true },
    });
    if (token.revokedAt !== null) {
      this.logger.warn(`Refresh token reuse detected; revoking family ${familyId}`);
      await this.revokeFamily(tx, familyId, now);
    }
  }

  private async revokeFamily(db: Db, familyId: string, now: Date): Promise<void> {
    await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async create(db: Db, userId: string, familyId: string) {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const saved = await db.refreshToken.create({
      data: { userId, familyId, tokenHash: hashToken(token), expiresAt },
      select: { id: true },
    });
    return { id: saved.id, token, expiresAt };
  }
}
