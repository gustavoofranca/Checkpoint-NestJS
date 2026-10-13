import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../../../common/auth/auth.decorators';
import type { Role } from '../../../generated/prisma/client';

// Runs after JwtAuthGuard. The role comes from the verified token, so a promotion takes effect
// at the next refresh, within the access token's 15 minutes.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined || roles.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user === undefined || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
    return true;
  }
}
