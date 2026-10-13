import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CatalogGame } from '../catalog-game';
import { normalizeSteamApp } from './normalize-steam-app';
import { steamAppDetailsResponseSchema } from './steam-app-details.schema';

export interface SteamClientOptions {
  baseUrl: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  // One delay per retry; the request gives up after the last one.
  retryDelaysMs: readonly number[];
}

export const STEAM_CLIENT_OPTIONS = Symbol('STEAM_CLIENT_OPTIONS');

// The only host the server ever calls (docs/SECURITY.md section 5). Tests replace these options
// through dependency injection to point at a local fake server; nothing in configuration or in a
// request can change them.
export const DEFAULT_STEAM_CLIENT_OPTIONS: SteamClientOptions = {
  baseUrl: 'https://store.steampowered.com/api/appdetails',
  requestTimeoutMs: 10_000,
  maxResponseBytes: 2 * 1024 * 1024,
  retryDelaysMs: [5_000, 15_000, 45_000],
};

export type AppDetailsResult =
  { outcome: 'game'; game: CatalogGame } | { outcome: 'rejected'; reason: string };

// Steam could not be reached or kept refusing after every retry: the run should stop rather than
// count every remaining game as broken.
export class SteamUnavailableError extends Error {
  constructor(appId: number, reason: string) {
    super(`Steam unavailable at app ${String(appId)}: ${reason}`);
    this.name = 'SteamUnavailableError';
  }
}

// 429 is Steam's rate limit; it has also been seen answering 403 when throttling.
const RETRYABLE_STATUS = (status: number) => status === 429 || status === 403 || status >= 500;

class ResponseTooLargeError extends Error {}

@Injectable()
export class SteamClient {
  private readonly logger = new Logger(SteamClient.name);

  constructor(@Inject(STEAM_CLIENT_OPTIONS) private readonly options: SteamClientOptions) {}

  // One request per app: appdetails rejects several ids in one call (400).
  async fetchAppDetails(appId: number): Promise<AppDetailsResult> {
    if (!Number.isSafeInteger(appId) || appId <= 0) {
      throw new Error(`Invalid Steam app id ${String(appId)}`);
    }
    const url = new URL(this.options.baseUrl);
    url.searchParams.set('appids', String(appId));
    url.searchParams.set('cc', 'us');
    url.searchParams.set('l', 'english');

    for (let attempt = 0; ; attempt += 1) {
      const result = await this.attempt(url);
      if (result.kind === 'done') {
        return this.interpret(appId, result.status, result.body);
      }
      if (result.kind === 'rejected') {
        return { outcome: 'rejected', reason: result.reason };
      }
      const delay = this.options.retryDelaysMs[attempt];
      if (delay === undefined) {
        throw new SteamUnavailableError(appId, result.reason);
      }
      this.logger.warn(
        `Steam app ${String(appId)}: ${result.reason}; retrying in ${String(delay)} ms`,
      );
      await sleep(delay);
    }
  }

  private async attempt(
    url: URL,
  ): Promise<
    | { kind: 'done'; status: number; body: string }
    | { kind: 'rejected'; reason: string }
    | { kind: 'retry'; reason: string }
  > {
    let response: Response;
    try {
      response = await fetch(url, {
        // A redirect is answered as is and rejected below, never followed to another host.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
    }
    if (RETRYABLE_STATUS(response.status)) {
      await response.body?.cancel();
      return { kind: 'retry', reason: `HTTP ${String(response.status)}` };
    }
    try {
      return { kind: 'done', status: response.status, body: await this.readCapped(response) };
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        return {
          kind: 'rejected',
          reason: `response larger than ${String(this.options.maxResponseBytes)} bytes`,
        };
      }
      return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  // Reads at most maxResponseBytes, aborting as soon as the limit is passed instead of buffering
  // whatever the server sends.
  private async readCapped(response: Response): Promise<string> {
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > this.options.maxResponseBytes) {
      await response.body?.cancel();
      throw new ResponseTooLargeError();
    }
    if (response.body === null) {
      return '';
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      // undici-types declares the body without an element type; check what actually arrives.
      const result: unknown = await reader.read();
      if (typeof result !== 'object' || result === null || !('done' in result)) {
        throw new Error('unexpected read result');
      }
      if (result.done === true) {
        return Buffer.concat(chunks).toString('utf8');
      }
      const value = 'value' in result ? result.value : undefined;
      if (!(value instanceof Uint8Array)) {
        throw new Error('unexpected body chunk');
      }
      total += value.byteLength;
      if (total > this.options.maxResponseBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError();
      }
      chunks.push(value);
    }
  }

  private interpret(appId: number, status: number, body: string): AppDetailsResult {
    if (status !== 200) {
      return { outcome: 'rejected', reason: `unexpected HTTP ${String(status)}` };
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return { outcome: 'rejected', reason: 'response is not JSON' };
    }
    const parsed = steamAppDetailsResponseSchema.safeParse(json);
    const entry = parsed.success ? parsed.data[String(appId)] : undefined;
    if (entry === undefined) {
      return { outcome: 'rejected', reason: 'response does not have the expected shape' };
    }
    if (!entry.success) {
      return { outcome: 'rejected', reason: 'Steam has no store data for it' };
    }
    const normalized = normalizeSteamApp(appId, entry.data);
    return normalized.ok
      ? { outcome: 'game', game: normalized.game }
      : { outcome: 'rejected', reason: normalized.reason };
  }
}
