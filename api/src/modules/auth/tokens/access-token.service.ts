import { Injectable } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { Role } from '../../../generated/prisma/client';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const JWT_ISSUER = 'checkpoint-api';
export const JWT_AUDIENCE = 'checkpoint';

// jsonwebtoken already checks exp, iss and aud; this checks what we put in.
const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.enum([Role.USER, Role.ADMIN]),
});

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  // Algorithm, issuer, audience and lifetime come from the JwtModule options in AuthModule.
  sign(user: AuthenticatedUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }

  // Returns null for any token that is not one we issued and still valid: bad signature,
  // other algorithm (including "none"), expired, wrong issuer or audience, malformed claims.
  async verify(token: string): Promise<AuthenticatedUser | null> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        return null;
      }
      throw error;
    }
    const claims = claimsSchema.safeParse(payload);
    return claims.success ? { id: claims.data.sub, role: claims.data.role } : null;
  }
}
