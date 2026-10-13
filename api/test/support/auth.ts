import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';
import { REFRESH_COOKIE } from '../../src/modules/auth/refresh-cookie';
import { JWT_AUDIENCE, JWT_ISSUER } from '../../src/modules/auth/tokens/access-token.service';
import { ALLOWED_ORIGIN } from './test-config';

export const PASSWORD = 'correct horse battery staple';

let sequence = 0;

export interface Credentials {
  email: string;
  username: string;
  password: string;
}

export function newCredentials(): Credentials {
  sequence += 1;
  return {
    email: `player${String(sequence)}@checkpoint.test`,
    username: `player_${String(sequence)}`,
    password: PASSWORD,
  };
}

// "refresh_token=<value>", ready for a Cookie header, from a response that set it.
export function refreshCookieFrom(response: Response): string {
  const cookie = response
    .get('Set-Cookie')
    ?.find((header) => header.startsWith(`${REFRESH_COOKIE}=`))
    ?.split(';')[0];
  if (cookie === undefined) {
    throw new Error('response did not set the refresh cookie');
  }
  return cookie;
}

export function accessTokenFrom(response: Response): string {
  const body: unknown = response.body;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('accessToken' in body) ||
    typeof body.accessToken !== 'string'
  ) {
    throw new Error('response has no access token');
  }
  return body.accessToken;
}

export interface Signed {
  credentials: Credentials;
  accessToken: string;
  refreshCookie: string;
}

export async function registerAndLogin(app: NestExpressApplication): Promise<Signed> {
  const credentials = newCredentials();
  await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials).expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: credentials.email, password: credentials.password })
    .expect(200);
  return {
    credentials,
    accessToken: accessTokenFrom(login),
    refreshCookie: refreshCookieFrom(login),
  };
}

export function refresh(app: NestExpressApplication, cookie: string): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/auth/refresh')
    .set('Origin', ALLOWED_ORIGIN)
    .set('Cookie', cookie);
}

// Tokens forged the ways an attacker would try, to prove each one is rejected.
export function forgeToken(
  secret: string,
  claims: Record<string, unknown>,
  options: JwtSignOptions = {},
): Promise<string> {
  return new JwtService().signAsync(claims, {
    secret,
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 900,
    ...options,
  });
}

export function unsignedToken(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}
