import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { CatalogGame, CatalogSnapshot } from '../modules/sync/catalog-game';
import { normalizeSteamApp } from '../modules/sync/steam/normalize-steam-app';
import { steamAppDetailsResponseSchema } from '../modules/sync/steam/steam-app-details.schema';
import { APP_IDS_FILE, SNAPSHOT_FILE } from './data-files';

// Developer tool: refreshes the bundled snapshot that the seed loads. It is run by hand, rarely,
// and never in CI. The scheduled sync (P6) has its own client with tests.
const APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const REQUEST_INTERVAL_MS = 1_500;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function requestOnce(appId: number): Promise<Response> {
  const url = new URL(APP_DETAILS_URL);
  url.searchParams.set('appids', String(appId));
  url.searchParams.set('cc', 'us');
  url.searchParams.set('l', 'english');
  return fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
}

async function readJson(appId: number, response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`app ${String(appId)}: Steam answered ${String(response.status)}`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    throw new Error(`app ${String(appId)}: response larger than ${String(MAX_RESPONSE_BYTES)}`);
  }
  return JSON.parse(body);
}

// Network errors, 429 and 5xx are retried after growing delays; anything else is final.
async function fetchAppDetails(appId: number): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await requestOnce(appId).catch((error: unknown) => error);
    if (response instanceof Response && response.status !== 429 && response.status < 500) {
      return readJson(appId, response);
    }
    if (response instanceof Response) {
      await response.body?.cancel();
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      throw new Error(`app ${String(appId)}: gave up after ${String(attempt + 1)} attempts`);
    }
    await sleep(delay);
  }
}

// `name` is only there so a reviewer can read the list; Steam's title is what gets stored.
const appIdListSchema = z.array(z.object({ appId: z.number().int().positive(), name: z.string() }));

async function loadAppIds(): Promise<number[]> {
  const ids = appIdListSchema
    .parse(JSON.parse(await readFile(APP_IDS_FILE, 'utf8')))
    .map((entry) => entry.appId);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${APP_IDS_FILE} contains duplicate app ids`);
  }
  return ids;
}

async function main(): Promise<void> {
  const appIds = await loadAppIds();
  const games: CatalogGame[] = [];
  const failures: string[] = [];

  for (const [index, appId] of appIds.entries()) {
    if (index > 0) {
      await sleep(REQUEST_INTERVAL_MS);
    }
    try {
      const entry = steamAppDetailsResponseSchema.parse(await fetchAppDetails(appId))[
        String(appId)
      ];
      const result = entry?.success
        ? normalizeSteamApp(appId, entry.data)
        : { ok: false as const, reason: 'Steam has no store data for it' };
      if (result.ok) {
        games.push(result.game);
      } else {
        failures.push(`${String(appId)}: ${result.reason}`);
      }
    } catch (error) {
      failures.push(`${String(appId)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    write(`[${String(index + 1)}/${String(appIds.length)}] ${String(appId)}`);
  }

  const snapshot: CatalogSnapshot = {
    fetchedAt: new Date().toISOString(),
    games: games.sort((a, b) => a.steamAppId - b.steamAppId),
  };
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);

  write(`Wrote ${String(games.length)} games to ${SNAPSHOT_FILE}`);
  write(`Skipped ${String(failures.length)}:`);
  for (const failure of failures) {
    write(`  ${failure}`);
  }
}

void main();
