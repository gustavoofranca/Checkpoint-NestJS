import type { IncomingMessage } from 'node:http';
import { routePattern } from '../http/route-pattern';

export interface RequestLogFields {
  route?: string;
  userId?: string;
}

// Added to the line logged when a request completes: by then routing has run and the auth guard
// has set the caller, if any (docs/ARCHITECTURE.md, Observability).
export function requestLogFields(request: IncomingMessage): RequestLogFields {
  const fields: RequestLogFields = {};
  const route = routePattern(request);
  if (route !== undefined) {
    fields.route = route;
  }
  const userId = authenticatedUserId(request);
  if (userId !== undefined) {
    fields.userId = userId;
  }
  return fields;
}

function authenticatedUserId(request: IncomingMessage): string | undefined {
  if (!('user' in request)) {
    return undefined;
  }
  const user: unknown = request.user;
  if (typeof user !== 'object' || user === null || !('id' in user)) {
    return undefined;
  }
  return typeof user.id === 'string' ? user.id : undefined;
}
