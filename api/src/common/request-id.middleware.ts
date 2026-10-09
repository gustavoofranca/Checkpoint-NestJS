import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Registered first, so requests rejected before routing (body too large, malformed JSON) still
// carry an id. The id is always generated here: a client-supplied one would let callers forge
// or inject log entries.
export function assignRequestId(request: Request, response: Response, next: NextFunction): void {
  const id = randomUUID();
  request.id = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}
