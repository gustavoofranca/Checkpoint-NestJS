import type { IncomingMessage } from 'node:http';

// The route that matched, as declared ("/api/v1/games/:slug"), never the raw URL: logs and metric
// labels then group requests per endpoint and never carry ids or search terms from the path.
// Undefined when no route matched (404) or before routing ran.
export function routePattern(request: IncomingMessage): string | undefined {
  if (!('route' in request)) {
    return undefined;
  }
  const route: unknown = request.route;
  if (typeof route !== 'object' || route === null || !('path' in route)) {
    return undefined;
  }
  if (typeof route.path !== 'string') {
    return undefined;
  }
  const baseUrl =
    'baseUrl' in request && typeof request.baseUrl === 'string' ? request.baseUrl : '';
  return `${baseUrl}${route.path}`;
}
