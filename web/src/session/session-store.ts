import { ApiError } from '../api/api-error';
import { authApi, expectNoContent, setTokenSource, unwrap } from '../api/client';
import type { AccessToken, Account } from '../api/types';

export type SessionState =
  { status: 'restoring' } | { status: 'signed-out' } | { status: 'signed-in'; account: Account };

// Refresh this long before the access token expires, so requests never carry an expired one.
const REFRESH_MARGIN_MS = 60_000;

// The session lives in memory only (docs/DESIGN.md, Front-end security): the access token in a
// variable, the refresh token in the HttpOnly cookie the browser holds. A reload restores the
// session by calling the refresh endpoint; nothing is written to localStorage or sessionStorage.
export class SessionStore {
  private state: SessionState = { status: 'restoring' };
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = Date.now) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SessionState => this.state;

  // The token for the next API request, renewed first when it is about to expire.
  readonly tokenForRequest = async (): Promise<string | null> => {
    if (this.accessToken !== null && this.now() >= this.expiresAt - REFRESH_MARGIN_MS) {
      await this.refresh();
    }
    return this.accessToken;
  };

  // Called once on page load. Without a valid refresh cookie the visitor is simply signed out.
  async restore(): Promise<void> {
    if (!(await this.refresh())) {
      this.setState({ status: 'signed-out' });
      return;
    }
    try {
      await this.loadAccount();
    } catch {
      this.clear();
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const token = await unwrap(authApi.POST('/api/v1/auth/login', { body: { email, password } }));
    this.acceptToken(token);
    await this.loadAccount();
  }

  async signUp(email: string, username: string, password: string): Promise<void> {
    await unwrap(authApi.POST('/api/v1/auth/register', { body: { email, username, password } }));
    await this.signIn(email, password);
  }

  async signOut(): Promise<void> {
    try {
      await expectNoContent(authApi.POST('/api/v1/auth/logout'));
    } finally {
      this.clear();
    }
  }

  private async loadAccount(): Promise<void> {
    const token = this.accessToken;
    if (token === null) {
      this.setState({ status: 'signed-out' });
      return;
    }
    const account = await unwrap(
      authApi.GET('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
    );
    this.setState({ status: 'signed-in', account });
  }

  // Concurrent callers share one refresh: the API rotates the cookie on every use, and a second
  // refresh with the old cookie would be treated as reuse and end the session.
  private refresh(): Promise<boolean> {
    this.refreshing ??= this.requestRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async requestRefresh(): Promise<boolean> {
    try {
      this.acceptToken(await unwrap(authApi.POST('/api/v1/auth/refresh')));
      return true;
    } catch (error) {
      // 401: no session or an expired one. Anything else leaves the user signed out too, since a
      // request with a stale token would fail anyway.
      if (!(error instanceof ApiError) || error.status !== 0) {
        this.clear();
      }
      return false;
    }
  }

  private acceptToken(token: AccessToken): void {
    this.accessToken = token.accessToken;
    this.expiresAt = this.now() + token.expiresIn * 1000;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        void this.refresh();
      },
      Math.max(token.expiresIn * 1000 - REFRESH_MARGIN_MS, 0),
    );
  }

  private clear(): void {
    clearTimeout(this.timer);
    this.accessToken = null;
    this.expiresAt = 0;
    this.setState({ status: 'signed-out' });
  }

  private setState(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const session = new SessionStore();
setTokenSource(session.tokenForRequest);
