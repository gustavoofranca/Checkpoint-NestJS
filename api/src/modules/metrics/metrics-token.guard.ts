import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config';

const BEARER = /^Bearer (\S+)$/;

// Comparing fixed-length digests keeps the comparison constant-time whatever the presented length.
function digest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

// /metrics is read by Prometheus with METRICS_TOKEN, not by users: access tokens do not apply.
// Without METRICS_TOKEN the endpoint does not exist.
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  private readonly expected: Buffer | undefined;

  constructor(config: AppConfig) {
    this.expected = config.metricsToken === undefined ? undefined : digest(config.metricsToken);
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.expected === undefined) {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined || !timingSafeEqual(digest(token), this.expected)) {
      throw new UnauthorizedException('A valid metrics token is required.');
    }
    return true;
  }
}
