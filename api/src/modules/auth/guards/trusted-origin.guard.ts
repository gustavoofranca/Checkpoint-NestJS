import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../../config/app-config';

// For the endpoints that act on the refresh cookie alone. SameSite=Strict already keeps the
// cookie off cross-site requests; requiring an allow-listed Origin is the second layer against
// CSRF. Browsers send Origin on every POST; clients that do not are not meant to use the cookie.
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin === undefined || !this.config.corsOrigins.includes(origin)) {
      throw new ForbiddenException('Request origin is not allowed.');
    }
    return true;
  }
}
