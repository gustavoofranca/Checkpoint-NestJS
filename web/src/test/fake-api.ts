import { vi } from 'vitest';

type Handler = (request: Request) => Response | Promise<Response>;

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function problem(status: number, detail: string, requestId = 'req-1'): Response {
  return json(
    status,
    { type: 'about:blank', title: 'Error', status, detail, requestId },
    { 'content-type': 'application/problem+json', 'X-Request-Id': requestId },
  );
}

// Replaces fetch with routes keyed by "METHOD /path"; any other request fails the test.
export function fakeApi(routes: Record<string, Handler>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: Request) => {
    const url = new URL(input.url);
    const key = `${input.method} ${url.pathname}`;
    calls.push(key);
    const handler = routes[key];
    if (handler === undefined) {
      throw new Error(`unexpected request ${key}`);
    }
    return handler(input);
  });
  return calls;
}
