import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, json, problem } from '../test/fake-api';
import { SessionStore } from './session-store';

const ACCOUNT = {
  id: '0199d4a2-0000-7000-8000-000000000001',
  email: 'ana@checkpoint.test',
  username: 'demo_ana',
  role: 'USER',
  createdAt: '2026-10-01T00:00:00.000Z',
};
const token = (value: string) =>
  json(200, { accessToken: value, tokenType: 'Bearer', expiresIn: 900 });

describe('SessionStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores a session from the refresh cookie and loads the account', async () => {
    const calls = fakeApi({
      'POST /api/v1/auth/refresh': () => token('access-1'),
      'GET /api/v1/auth/me': (request) =>
        request.headers.get('Authorization') === 'Bearer access-1'
          ? json(200, ACCOUNT)
          : problem(401, 'no token'),
    });
    const store = new SessionStore();

    await store.restore();

    expect(store.getSnapshot()).toEqual({ status: 'signed-in', account: ACCOUNT });
    expect(calls).toEqual(['POST /api/v1/auth/refresh', 'GET /api/v1/auth/me']);
  });

  it('is signed out when there is no session to restore', async () => {
    fakeApi({ 'POST /api/v1/auth/refresh': () => problem(401, 'The session is invalid.') });
    const store = new SessionStore();

    await store.restore();

    expect(store.getSnapshot()).toEqual({ status: 'signed-out' });
    expect(await store.tokenForRequest()).toBeNull();
  });

  it('shares one refresh between concurrent requests near expiry', async () => {
    let now = 0;
    let refreshes = 0;
    fakeApi({
      'POST /api/v1/auth/login': () => token('access-1'),
      'GET /api/v1/auth/me': () => json(200, ACCOUNT),
      'POST /api/v1/auth/refresh': () => {
        refreshes += 1;
        return token(`access-${String(refreshes + 1)}`);
      },
    });
    const store = new SessionStore(() => now);
    await store.signIn('ana@checkpoint.test', 'correct horse battery staple');

    now = 850_000; // 50 s before the 15-minute token expires
    const tokens = await Promise.all([store.tokenForRequest(), store.tokenForRequest()]);

    expect(refreshes).toBe(1);
    expect(tokens).toEqual(['access-2', 'access-2']);
  });

  it('surfaces a failed sign-in as the API error and stays signed out', async () => {
    fakeApi({
      'POST /api/v1/auth/login': () => problem(401, 'Invalid email or password.', 'req-42'),
    });
    const store = new SessionStore();

    await expect(store.signIn('ana@checkpoint.test', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
      requestId: 'req-42',
    });
    expect(await store.tokenForRequest()).toBeNull();
  });

  it('forgets the token on sign-out even when the API cannot be reached', async () => {
    fakeApi({
      'POST /api/v1/auth/login': () => token('access-1'),
      'GET /api/v1/auth/me': () => json(200, ACCOUNT),
      'POST /api/v1/auth/logout': () => Promise.reject(new TypeError('network down')),
    });
    const store = new SessionStore();
    await store.signIn('ana@checkpoint.test', 'correct horse battery staple');

    await expect(store.signOut()).rejects.toMatchObject({ status: 0 });

    expect(store.getSnapshot()).toEqual({ status: 'signed-out' });
    expect(await store.tokenForRequest()).toBeNull();
  });
});
