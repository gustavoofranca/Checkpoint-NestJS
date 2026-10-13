import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const AUTH_RATE_LIMIT_KEY = 'authRateLimit';

interface AuthRateLimitOptions {
  // Also count attempts per email in the body, whatever IP they come from.
  perAccount: boolean;
}

// Applies the stricter credential limits (docs/SECURITY.md section 4) to a route.
export const AuthRateLimit = (options: AuthRateLimitOptions) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, options);

const reflector = new Reflector();

export function authRateLimitOf(context: ExecutionContext): AuthRateLimitOptions | undefined {
  return reflector.get<AuthRateLimitOptions | undefined>(AUTH_RATE_LIMIT_KEY, context.getHandler());
}

// The email the request is about, normalized like the DTOs do, or undefined.
export function accountOf(request: Record<string, unknown>): string | undefined {
  const body = request.body;
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return undefined;
  }
  return typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
}
