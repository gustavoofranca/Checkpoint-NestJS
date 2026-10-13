import type { CookieOptions, Request, Response } from 'express';
import type { IssuedRefreshToken } from './tokens/refresh-token.service';

export const REFRESH_COOKIE = 'refresh_token';

// HttpOnly keeps it from scripts, Secure from plain HTTP (browsers treat localhost as secure),
// SameSite=Strict and the path keep it off every request except the auth endpoints.
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

export function setRefreshCookie(response: Response, refreshToken: IssuedRefreshToken): void {
  response.cookie(REFRESH_COOKIE, refreshToken.token, {
    ...COOKIE_OPTIONS,
    expires: refreshToken.expiresAt,
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, COOKIE_OPTIONS);
}

export function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies[REFRESH_COOKIE];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
