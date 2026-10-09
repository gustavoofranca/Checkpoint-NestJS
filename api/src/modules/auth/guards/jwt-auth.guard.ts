import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/auth/auth.decorators';
import { AccessTokenService } from '../tokens/access-token.service';

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

// Registered globally: every route needs a valid access token unless it is marked @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) {
      throw new UnauthorizedException('Authentication required.');
    }
    const user = await this.accessTokens.verify(token);
    if (user === null) {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }
    request.user = user;
    return true;
  }
}
