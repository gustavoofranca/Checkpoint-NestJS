import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

// @nestjs/throttler names the header "Retry-After-<throttler>" for every throttler but the
// default one; clients only understand the standard "Retry-After" (RFC 9110), in seconds.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(Math.max(detail.timeToBlockExpire, 1)));
    throw new ThrottlerException('Too many requests. Try again later.');
  }
}
