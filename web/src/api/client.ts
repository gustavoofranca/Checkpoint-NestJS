import createClient, { type Middleware } from 'openapi-fetch';
import { ApiError, networkError, toApiError } from './api-error';
import type { paths } from './schema';

// Typed against the committed OpenAPI document (src/api/schema.d.ts, from npm run api:types).
// Absolute even for the page's own origin: Request needs an absolute URL outside browsers (tests).
const baseUrl = import.meta.env.VITE_API_URL ?? window.location.origin;

// Supplies the access token; the session store registers itself here, so the client does not
// import the session.
type TokenSource = () => Promise<string | null>;
let tokenSource: TokenSource = () => Promise.resolve(null);

export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

const bearer: Middleware = {
  async onRequest({ request }) {
    const token = await tokenSource();
    if (token !== null) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
};

// Requests from the session itself: login, refresh, logout. They carry the refresh cookie and no
// access token, so they bypass the middleware above.
// fetch is looked up on every call rather than captured once, so tests can replace it.
const fetchNow = (request: Request) => globalThis.fetch(request);

export const authApi = createClient<paths>({ baseUrl, credentials: 'include', fetch: fetchNow });

export const api = createClient<paths>({ baseUrl, fetch: fetchNow });
api.use(bearer);

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

// Resolves to the response body or throws an ApiError; a network failure is an ApiError too.
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw networkError();
  }
  if (!result.response.ok) {
    throw toApiError(result.error, result.response);
  }
  if (result.data === undefined) {
    throw new ApiError(result.response.status, 'The server answered without a body.');
  }
  return result.data;
}

// For 204 answers, which carry no body.
export async function expectNoContent(request: Promise<FetchResult<unknown>>): Promise<void> {
  let result: FetchResult<unknown>;
  try {
    result = await request;
  } catch {
    throw networkError();
  }
  if (!result.response.ok) {
    throw toApiError(result.error, result.response);
  }
}

// A 404 that means "none yet" (no review, not in the library) rather than an error.
export async function orNull<T>(request: Promise<FetchResult<T>>): Promise<T | null> {
  try {
    return await unwrap(request);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      return null;
    }
    throw error;
  }
}
