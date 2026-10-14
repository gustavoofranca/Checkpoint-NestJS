import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { routePattern } from './route-pattern';

function requestWith(fields: Record<string, unknown>): IncomingMessage {
  return Object.assign(new IncomingMessage(new Socket()), fields);
}

describe('routePattern', () => {
  it('joins the router base URL and the matched route path', () => {
    expect(routePattern(requestWith({ baseUrl: '/api', route: { path: '/games/:slug' } }))).toBe(
      '/api/games/:slug',
    );
    expect(routePattern(requestWith({ route: { path: '/api/v1/genres' } }))).toBe('/api/v1/genres');
  });

  it('is undefined when no route matched or the route has no string path', () => {
    expect(routePattern(requestWith({}))).toBeUndefined();
    expect(routePattern(requestWith({ route: undefined }))).toBeUndefined();
    expect(routePattern(requestWith({ route: { path: /regex/ } }))).toBeUndefined();
  });
});
