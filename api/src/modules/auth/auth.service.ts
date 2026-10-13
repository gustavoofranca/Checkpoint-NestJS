import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { PasswordHasher } from '../users/password-hasher';
import { UsersService } from '../users/users.service';
import type { AccessTokenResponseDto } from './dto/access-token-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { ACCESS_TOKEN_TTL_SECONDS, AccessTokenService } from './tokens/access-token.service';
import { type IssuedRefreshToken, RefreshTokenService } from './tokens/refresh-token.service';

export const INVALID_CREDENTIALS = 'Invalid email or password.';
export const INVALID_SESSION = 'The session is invalid or has expired. Sign in again.';

export interface Session {
  body: AccessTokenResponseDto;
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Verified against when the email is unknown, so both login failures cost one Argon2 run and
  // response time does not reveal which accounts exist.
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  // Hashing happens before the insert, so a taken email costs the same time as a new one.
  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.users.create({ email: dto.email, username: dto.username, passwordHash });
  }

  async login(dto: LoginDto): Promise<Session> {
    const user = await this.users.findCredentials(dto.email);
    const matches = await this.hasher.verify(dto.password, user?.passwordHash ?? this.dummyHash);
    if (user === null || !matches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const identity = { id: user.id, role: user.role };
    return this.session(identity, await this.refreshTokens.issue(user.id));
  }

  async refresh(presented: string | undefined): Promise<Session> {
    if (presented === undefined) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    const result = await this.refreshTokens.rotate(presented);
    if (result.outcome === 'rejected') {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return this.session(result.user, result.refreshToken);
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented !== undefined) {
      await this.refreshTokens.revokeFamilyOf(presented);
    }
  }

  private async session(
    user: AuthenticatedUser,
    refreshToken: IssuedRefreshToken,
  ): Promise<Session> {
    return {
      body: {
        accessToken: await this.accessTokens.sign(user),
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
      refreshToken,
    };
  }
}
