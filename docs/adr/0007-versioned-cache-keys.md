# 0007. Cache-aside with versioned keys

- Status: accepted
- Date: 2026-10-13

## Context

Catalog reads (`GET /games`, `/games/:slug`, `/genres`) are public, identical for every caller
and far more frequent than writes. Writes that change them are rare: a review changes a game's
rating, and the catalog sync (P6) changes games. A list page can contain any game, so a write
cannot know which cached pages it made stale.

## Decision

- Cache-aside in `src/redis/cache.service.ts`: read the key; on a miss, load from PostgreSQL and
  store the JSON with a TTL. 5 minutes for lists and genres, 10 for game details.
- Keys carry a namespace version: `games:v<n>:list:<sha256 of the normalized query>`,
  `games:v<n>:detail:<slug>`, `games:v<n>:genres`. The version lives in `games:version`.
- Invalidation is `INCR games:version`. Every key built afterwards uses the new number, so all
  older entries become unreachable at once, without listing or deleting them; they expire on
  their TTL.
- Review writes invalidate after their transaction commits. If they invalidated before, a reader
  could load the old rating between the two and store it under the new version.
- Only public data is cached. Nothing per user, nothing behind authentication.
- Redis failures never fail a request. Commands fail fast (no offline queue, 500 ms timeout), the
  service logs a warning and serves from PostgreSQL.
- Hit and miss counters are kept for the metrics endpoint (P7).

## Consequences

- One write invalidates the whole catalog namespace, including pages it did not touch. With
  rare writes and short TTLs that costs a few extra queries; it can never serve a stale rating
  after a successful write.
- Each read costs two Redis round trips: the version, then the key.
- A value written concurrently under the old version is harmless: no reader builds that key
  again.
- If Redis is down when a write happens, the version is not incremented; once Redis is back,
  entries cached before the outage can be served until their TTL ends (at most 10 minutes).
- Cached values must be plain JSON. The catalog DTOs are (dates are `YYYY-MM-DD` strings).

## Alternatives considered

- **Deleting matching keys** (`SCAN games:*` then `DEL`): cost grows with the number of keys and
  the scan is not atomic with concurrent writes.
- **Tracking which pages contain a game**: precise, but needs a reverse index kept consistent with
  every page shape.
- **TTL only**: the rating shown after a review could be up to 10 minutes old, which the plan
  rules out ("the game detail shows the new rating immediately").
- **HTTP caching (ETag, Cache-Control)**: useful in front of the API later, but it does not reduce
  database work for different clients.
