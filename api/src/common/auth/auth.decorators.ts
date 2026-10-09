import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from './authenticated-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

// Every route requires an access token unless marked public. A forgotten decorator therefore
// fails closed (docs/ARCHITECTURE.md, Request pipeline).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Restricts an authenticated route to the listed roles. Routes open to every signed-in user
// need no @Roles.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (user === undefined) {
      // Only reachable if @CurrentUser is used on a @Public route: a programming error, so a
      // plain Error, which the filter logs and turns into a generic 500.
      throw new Error('CurrentUser used on an unauthenticated route');
    }
    return user;
  },
);
