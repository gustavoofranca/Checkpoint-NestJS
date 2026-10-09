import type { NextFunction, Request, Response } from 'express';

// Anything that would mean a hash left the API: field names in either casing, or an Argon2 PHC
// string itself. Checked on every response the e2e suite receives.
const FORBIDDEN = [/passwordHash/i, /password_hash/i, /tokenHash/i, /token_hash/i, /\$argon2id\$/];

const leaks: string[] = [];

function bodyText(body: unknown): string {
  if (body === undefined) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  return JSON.stringify(body);
}

// Wraps res.send, which res.json also goes through.
export function recordLeakingResponses(request: Request, response: Response, next: NextFunction) {
  const send = response.send.bind(response);
  response.send = (body?: unknown) => {
    if (FORBIDDEN.some((pattern) => pattern.test(bodyText(body)))) {
      leaks.push(`${request.method} ${request.originalUrl}`);
    }
    return send(body);
  };
  next();
}

export function takeLeaks(): string[] {
  return leaks.splice(0);
}
