# 0009. Steam's appdetails endpoint, over a curated list of games

- Status: accepted
- Date: 2026-10-13

## Context

The catalog mirrors public store data from Steam. The endpoint that serves it,
`https://store.steampowered.com/api/appdetails`, is not documented or supported by Valve, so its
behaviour was checked before writing the client (2026-10-09 and 2026-10-13):

| Request | Answer |
|---|---|
| A game, `?appids=1145360&cc=us&l=english` | 200, `{ "1145360": { "success": true, "data": { … } } }` |
| An id with no store page, `?appids=1` | 200, `{ "1": { "success": false } }`: not an HTTP error |
| Two ids, `?appids=570,730` | 400: one app per request |
| A non-numeric id | 400 |
| Response headers | `Cache-Control: public,max-age=3600`; no rate-limit headers |

The rate limit is not published and no header reports it. Community reports put it at about 200
requests per 5 minutes per IP, answered with 429 (and sometimes 403) when exceeded. Building the
bundled snapshot sent 211 requests 1.5 s apart (200 per 5 minutes) without a single refusal.

Steam's full app list has well over a hundred thousand entries, most of them DLC, tools,
soundtracks and delisted apps.

## Decision

- **Curated list.** The catalog follows the games in `api/prisma/data/steam-app-ids.json` (211
  well-known games, each with its name for review). The full app list is never crawled.
- **One request at a time, 2 s apart**: 150 requests per 5 minutes, a quarter under the reported
  limit. A full run takes about 7 minutes.
- **Client** (`src/modules/sync/steam/steam-client.ts`): fixed host, 10 s timeout per request,
  2 MB response cap enforced while reading, redirects never followed, every payload validated with
  zod and normalized (HTML stripped, lengths capped, image hosts allow-listed, list price).
- **Retries**: 429, 403, 5xx, timeouts and network errors are retried after 5, 15 and 45 seconds.
  After the last retry Steam counts as unavailable and the run stops as FAILED rather than marking
  every remaining game broken.
- **Per-game failures** (no store data, invalid payload, not a game, unknown image host) are counted
  in `gamesFailed` and skipped; one bad game never fails the run.
- **Offline seed.** The same normalization built `steam-snapshot.json`, which the seed loads, so
  development and CI never call Steam.

## Consequences

- A game is added by appending its id to the list; the next sync fetches it.
- If Valve changes the payload, validation rejects the games and the run reports them; nothing
  half-parsed reaches the database.
- If the rate limit turns out lower, the interval is one constant (`DEFAULT_SYNC_OPTIONS`).
- Prices are US list prices in USD.

## Alternatives considered

- **Steam Web API with a key** (`IStoreService/GetAppList`): needs a secret for little benefit,
  and the store details still come from appdetails.
- **Crawling the full app list**: hours of requests near the rate limit for mostly irrelevant apps.
- **Parallel requests**: faster runs, but every extra request in flight is risk against an
  undocumented limit, and a daily job has time to spare.
