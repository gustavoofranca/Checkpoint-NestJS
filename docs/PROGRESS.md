# Progress log

Updated by the agent at the end of every phase. Newest entry first.

## Template

### P<n> — <phase name> — <date>
- Status: done | partial
- Built:
- Decisions not dictated by the spec:
- Dependencies added (name@version):
- Verification (command → result):
- Known limitations / open questions:

---

### P5 — Cache and rate limiting — 2026-10-13
- Status: done
- Built:
  - `src/redis/cache.service.ts`: cache-aside with versioned keys (`games:v<n>:…`), hit and miss
    counters; applied to `GET /games` (5 min), `/games/:slug` (10 min) and `/genres` (5 min)
  - Review writes invalidate the catalog after their transaction commits
  - Redis client: no offline queue and a 500 ms command timeout, so an unavailable Redis fails
    fast; startup waits up to 2 s for the first connection but does not require it
  - `src/rate-limit`: Redis storage (one Lua script per request), `AppThrottlerGuard` (standard
    `Retry-After`), `@AuthRateLimit()`; limiters `default`, `auth-ip`, `auth-account`
  - `TRUST_PROXY_HOPS` setting for the client IP
  - Tests: `cache.e2e-spec.ts`, `rate-limit.e2e-spec.ts`; tests use Redis database 1, emptied
    before every e2e test
  - `docs/adr/0007` (versioned cache keys), `docs/adr/0008` (rate limiting)
- Decisions not dictated by the spec:
  - Limits: 300 requests a minute per IP everywhere; 30 credential requests per 15 minutes per IP
    on login, register and refresh; 5 per 15 minutes per email on login and register; blocks last
    15 minutes (`docs/adr/0008`)
  - When Redis is down the credential limiters fail closed (503) and the global one fails open
  - Every login attempt counts, not only failed ones: counting failures would need the limiter
    after the Argon2 check, which an attacker could make the server run without limit
  - Own throttler storage instead of `@nest-lab/throttler-storage-redis`: about forty lines, no
    extra package, and the failure mode can differ per limiter
  - List cache keys hash the normalized query; searches that differ only in case share an entry
  - Invalidation is per namespace: one review makes every cached catalog page miss once
  - `X-RateLimit-*` headers are off; only `Retry-After` is sent, on 429
- Dependencies added (name@version): @nestjs/throttler@6.7.1
- Verification (command → result):
  - Second identical `GET /games` → served from the cache: 0 SQL statements, hit counter +1
  - After a review write, `GET /games/:slug` and the `top_rated` list show the new rating; with
    the invalidation call removed the same test fails (negative control)
  - Redis unreachable → `/games`, `/games/:slug`, `/genres` answer 200 in under a second each
  - 6th login for one email within the window → 429 Problem Details, `Retry-After` in seconds
    (1–900); case and spacing variants of the email count together; another email is unaffected
  - 31st credential request from one IP → 429; a spoofed `X-Forwarded-For` does not reset the IP
    count; with `TRUST_PROXY_HOPS=1` the account limit holds across client IPs and IPs count
    separately
  - 301st request a minute to any route → 429
  - Redis unreachable → login 503, catalog 200
  - Storage: counts, blocks past the limit, does not count while blocked, releases after expiry
  - `npm run test:cov` → 287 of 287; lines 97.8%, branches 85.8%; lint, format, typecheck, build
    pass; `db:drift` → no difference; `npm audit --omit=dev` → 0
- Known limitations / open questions:
  - Five failed logins lock an account's login for 15 minutes, which someone else can trigger on
    purpose (`docs/adr/0008`)
  - Cache metrics are counters in memory, exported in P7
  - On 2026-10-13 the development PostgreSQL and Redis volumes turned out to have been recreated
    outside this work; the development database was migrated and seeded again

---

### P4 — Reviews, library, profiles — 2026-10-09
- Status: done
- Built:
  - `src/modules/reviews`: `GET /games/:slug/reviews` (newest first, author username, cursor),
    `PUT` and `DELETE /games/:slug/reviews/me`; each write locks the game row and recomputes
    `rating_average` and `rating_count` in the same transaction
  - `src/modules/library`: `GET /me/library` (status filter, most recently changed first, cursor),
    `PUT` and `DELETE /me/library/:gameId`
  - `GET /users/:username` in `src/modules/users`: username, join date, review count and the 5
    latest reviews, from an explicit select (no email, role or id)
  - Migration with the `(user_id, updated_at, game_id)` index on library entries and
    `(user_id, created_at)` on reviews
  - Tests: `authorization.e2e-spec.ts` (every protected route × no, malformed and expired token),
    `reviews.e2e-spec.ts`, `library.e2e-spec.ts`, `profiles.e2e-spec.ts`
  - `docs/adr/0006` (denormalized ratings); authorization matrix in `api/test/README.md` complete
- Decisions not dictated by the spec:
  - Review writes take `SELECT … FOR UPDATE` on the game row, then recompute the aggregate from
    all reviews (not deltas). The 20-concurrent-reviews test fails 5 times out of 5 without the
    lock and passes with it (`docs/adr/0006`)
  - `PUT /reviews/me` answers 200 for both create and replace, with the review
  - Review list is newest first by `(created_at, id)`; replacing a review keeps its creation date
  - Library list is most recently changed first by `(updated_at, game_id)`
  - Deleting a review the caller does not have, or a game not in the library, answers 404
  - Unknown game on `PUT /me/library/:gameId` is detected from the foreign key (P2003), not by a
    read beforehand
  - A review body is trimmed before validation (10–2000 characters)
  - Profiles show the 5 latest reviews; the spec does not give a number
  - Timestamps used in cursors have millisecond precision because Prisma fills them, the same as
    a JavaScript `Date`; checked on stored rows
- Dependencies added: none
- Verification (command → result):
  - Creates, updates and deletes by three users on two games → stored rating columns equal a fresh
    `round(avg(rating), 2)` and `count(*)` after every step; the game detail shows the new rating
  - Two concurrent PUTs by one user → one review; 20 concurrent reviewers on one game → count 20,
    average 3.00, equal to the fresh aggregate
  - User A's `DELETE …/reviews/me` and `DELETE /me/library/:gameId` leave user B's rows in place;
    A's `PUT`s create A's own rows and leave B's unchanged; A's library lists none of B's entries
  - Every protected route → 401 without a token, with a malformed one and with an expired one
  - Mass assignment: `userId` in a review or library body → 400
  - Profile response parsed with a strict schema (any extra field fails) and contains no email
  - `npm run test:cov` → 266 of 266; lines 98.0%, branches 85.5%; `db:drift` → no difference;
    lint, format, typecheck, build pass
- Known limitations / open questions:
  - Review writes are not rate limited and do not invalidate the catalog cache yet (P5)
  - Branch coverage is close to the 85% floor; the DTO files count decorator-metadata branches
    that tests cannot reach

---

### P3 — Catalog — 2026-10-09
- Status: done
- Built:
  - `src/modules/games`: `GET /games` (title search, genre filter, `newest` / `top_rated` /
    `title` sorts), `GET /games/:slug` (genres, price, rating summary), `GET /genres` (with game
    counts); response DTOs built from explicit selects
  - `src/common/pagination`: cursor encode and decode with schema validation, `toPage`,
    `PaginationQueryDto` (limit 1–50, default 20)
  - `src/common/openapi`: Swagger UI at `/api/v1/docs` and `/api/v1/docs/openapi.json`, off in
    production unless `ENABLE_DOCS=true`; Problem Details documented as
    `application/problem+json`. Every route so far (auth, catalog, health) has a summary, tag,
    request and response DTOs and its error statuses.
  - Migrations: `title_sort` column with its index (backfills existing rows), then the `"C"`
    collation on it
  - `docs/adr/0005` (cursor pagination), `docs/query-plans/catalog.md` (EXPLAIN of each query)
  - Tests: `test/games.e2e-spec.ts` (30), pagination and text unit tests; a query-counting
    Prisma client for the bounded-queries test
- Decisions not dictated by the spec:
  - Default sort `newest`. Games without a release date come first under `newest`: that order
    is a backward scan of the existing index, and announced games at the top of "newest" suit a
    catalog (`docs/adr/0005`)
  - Title sort uses an application-computed key with byte collation, because the database locale
    made the order depend on the image (Alpine sorted "ARK" before "Age")
  - Cursor conditions carry a redundant bound on the sort key so PostgreSQL starts the index scan
    at the cursor; without it a deep page would scan from the start (seen while designing, proven
    by the plans)
  - Cursors are base64url JSON, unsigned, and carry the sort; one from another sort is a 400
  - `GET /genres` returns `{ data }` without a cursor, capped at 100: Steam's genre taxonomy is a
    few dozen entries. This is the one list without pagination.
  - Unknown query parameters (an `offset`, for instance) are rejected with 400 by the global
    whitelist
  - Response shape: `rating: { average, count }`, `price: { amountCents, currency } | null`,
    `releaseDate` as `YYYY-MM-DD`
  - OpenAPI annotations were added to the P2 auth and P0 health routes too, so the document
    is complete; response interfaces became DTO classes for it
- Dependencies added (name@version): @nestjs/swagger@12.0.2
- Verification (command → result):
  - Paging through the whole seed with `limit=7` → every game once and in the order computed
    independently in the test, for each sort and for one genre
  - Invalid cursor, cursor of another sort, `limit=0`, `limit=51`, one-character `q`, unknown
    sort, `offset` → 400 Problem Details
  - `q` with `%`, `_` or a quote matches literally and does not error
  - `GET /games` with `limit=5` and `limit=50` → 3 SQL statements each (games, genre links,
    genres)
  - EXPLAIN of the exact SQL Prisma sends → index scans for every sort, with `Index Cond` on the
    key after a cursor; the search uses the trigram index once sequential scans are not cheaper
    (`docs/query-plans/catalog.md`)
  - `/api/v1/docs/openapi.json` → 200 in test, 404 in production, 200 in production with
    `ENABLE_DOCS=true`; Swagger UI uses no inline script, so helmet's CSP stays strict
  - `npm run test:cov` → 215 of 215; lines 97.9%, branches 87.5%; `db:drift` → no difference;
    lint, format, typecheck, build pass; `npm audit --omit=dev` → 0
- Known limitations / open questions:
  - Existing databases got `title_sort = lower(title)` from the migration; `npm run db:seed`
    writes the exact key (accents and trademark signs removed)
  - Search is a substring filter, not a ranked search; results follow the chosen sort
  - Catalog reads are not cached yet (P5)
  - The committed `openapi.json` and its CI drift check come in P8

---

### P2 — Authentication — 2026-10-09
- Status: done
- Built:
  - `src/modules/auth`: `POST /auth/register`, `/login`, `/refresh`, `/logout`, `GET /auth/me`;
    `AccessTokenService` (JWT), `RefreshTokenService` (rotation, reuse detection), refresh cookie
    helpers, `JwtAuthGuard` and `RolesGuard` registered globally, `TrustedOriginGuard`
  - `src/common/auth`: `@Public()`, `@Roles()`, `@CurrentUser()`, `AuthenticatedUser`
  - `src/modules/users`: `UsersService` (create, credentials lookup, own account), response
    shape built from an explicit field list
  - `cookie-parser` in the pipeline; health endpoints marked `@Public()`
  - Tests: `test/auth.e2e-spec.ts` (38 tests), test-only protected routes, a suite-wide guard
    that fails any e2e test whose responses carry a password hash, token hash or Argon2 string
  - `api/test/README.md` with the test layout and the authorization matrix;
    `docs/adr/0004` (token design)
- Decisions not dictated by the spec:
  - Register answers 409 with one message for a taken email or username ("This email or
    username cannot be used."). Without an email flow, registration cannot fully hide that an
    email exists; the shared message and hashing before the insert keep the signal minimal.
    Rate limiting (P5) is the remaining control.
  - Login on an unknown email verifies the password against a hash computed at startup, so both
    failures cost one Argon2 run (asserted with a spy on the real `PasswordHasher`)
  - Refresh rotation claims the token with a conditional update; a token that cannot be claimed
    because it is revoked counts as reuse. Two concurrent refreshes with one token therefore end
    the session (`docs/adr/0004`)
  - `refresh` and `logout` require an allow-listed `Origin` header (403 otherwise); logout is
    idempotent (204 without a session)
  - Claims are validated after signature checks (`sub` must be a UUID, `role` a known role);
    the role in the token applies until the next refresh
  - `@Roles()` is only for restricting; routes open to every signed-in user carry no decorator
  - Emails are trimmed and lowercased by the DTO; usernames must already be lowercase (400
    otherwise) rather than silently changed
  - JWT issuer `checkpoint-api`, audience `checkpoint`
- Dependencies added (name@version): @nestjs/jwt@12.0.2 (uses jsonwebtoken 9.0.3),
  cookie-parser@1.4.7; dev: @types/cookie-parser@1.4.10
- Verification (command → result):
  - `npm run test:cov` → 174 of 174 tests; lines 97.3%, branches 87.4%
  - Full flow register → login → me → refresh → logout → refresh rejected: passes
  - Reusing a rotated refresh token → 401, and no unrevoked token remains in the family
  - Two concurrent refreshes with one token → statuses [200, 401], family revoked
  - Expired, malformed, other-secret, `alg: none`, HS512, wrong issuer, wrong audience, unknown
    role and missing-subject tokens → 401 with Problem Details
  - `role: "ADMIN"` in the register body → 400, no user created
  - Unknown email and wrong password → same status and body apart from the request id
  - Refresh cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, 30 days
  - `npm run lint`, `format:check`, `typecheck`, `build` pass; `npm audit --omit=dev` → 0
- Known limitations / open questions:
  - No rate limit on login, register and refresh yet (P5)
  - Authentication events (login failure, reuse detected, logout) are not audit-logged yet,
    except a warning on reuse (P7)
  - A refresh token can only be revoked by family; there is no "sign out everywhere" endpoint,
    which the spec does not ask for
  - Re-throwing a non-unique database error on register is not reachable through the API (the
    DTO enforces the same rules as the CHECK constraints) and stays uncovered

---

### P1 — Database — 2026-10-09
- Status: done
- Built:
  - `prisma/schema.prisma`: the whole data model of `SPEC.md` (8 models, 4 enums), snake_case
    tables and columns, `timestamptz`, `numeric(3,2)`, `char(3)`, one index per filter and sort
  - `prisma/migrations/…_init`: generated migration plus commented raw SQL for `pg_trgm` and 17
    CHECK constraints (email lowercase, username format, slug format, token hash format, list
    columns not null, price and currency pairing, rating ranges, review body length, sync counts)
  - `prisma/data/steam-app-ids.json` (211 curated games, with names for review) and
    `steam-snapshot.json`, built from Steam's appdetails on 2026-10-09: 211 of 211 accepted
  - `src/modules/sync`: zod schema for appdetails, normalization (HTML stripped, lengths capped,
    image hosts allow-listed, list price), release date parser; reused by the P6 sync
  - `src/prisma/seed-database.ts` and `npm run db:seed`: idempotent seed of games, genres and two
    demo users; keeps slugs and ratings on re-runs
  - `src/modules/users`: `PasswordHasher` (native Argon2id) and `promoteToAdmin`, with
    `npm run admin:promote -- <email>`
  - `src/cli`: compiled entry points for the seed, the promotion and the snapshot builder
  - Test database: tests derive `<name>_test` from `DATABASE_URL`; a global setup creates and
    migrates it. This removes the P0 limitation of e2e tests using the development database.
  - CI: migrations on the empty database, drift check, built CLIs run (seed twice, promote)
  - `docs/adr/0002` (UUID v7) and `docs/adr/0003` (native Argon2id)
- Decisions not dictated by the spec:
  - UUID v7 from Prisma's `@default(uuid(7))`, not Node or PostgreSQL 18 (`docs/adr/0002`)
  - Argon2id from `node:crypto` (Node 24.7+), PHC strings, OWASP minimum m=19 MiB t=2 p=1,
    checked against RFC 9106's test vector (`docs/adr/0003`); `engines` raised to `>=24.7`
  - CLI entry points live in `src/cli` and are compiled, instead of `prisma/seed.ts` run through
    a TypeScript runner: `admin:promote` must run in the production image, which only has `dist`,
    and no runner dependency is needed
  - The CLIs read only `DATABASE_URL` (plus `SEED_DEMO_PASSWORD` for the seed), not the API's
    whole environment; same validation and error format through `parseEnvironment`
  - Demo users `demo_ana` and `demo_bruno` on the reserved `.test` domain; their password comes
    from `SEED_DEMO_PASSWORD`, so none is committed. Existing users are never overwritten.
  - Extra index `(title, id)` for the `title` sort; SPEC lists indexes only for the other two
  - `RefreshToken.replacedById` is a unique self-relation with `ON DELETE SET NULL`
  - Slugs: legal marks dropped, NFKD, ASCII words with hyphens, capped at 100; on a collision
    the lowest app id keeps the plain slug, others get `-<appId>`; slugs never change on re-seed
  - Price is Steam's list price (`initial`), not the discounted one, so a snapshot taken during a
    sale does not freeze the sale price
  - Drift check compares a freshly migrated database with the schema
    (`--from-config-datasource`), which needs no shadow database; proven to flag a schema change
  - `prisma.config.ts` became `prisma.config.mts` so `import.meta` is valid; it loads the root
    `.env` because the Prisma 7 CLI no longer does
  - Logs: errors are serialized to type, message, code and stack only. Prisma attaches
    PostgreSQL's "Failing row contains (...)" detail, password hashes included, to an enumerable
    `meta` field, and pino's default serializer copied it into the log (found while writing the
    constraint tests; fixed in `src/common/logging/serialize-error.ts`, with a test)
- Dependencies added: none
- Verification (command → result):
  - `prisma migrate deploy` against a database that did not exist → created and migrated
  - `npm run db:drift` → `No difference detected.`, exit 0; with a field added to a copy of the
    schema → exit 2
  - `npm run test:cov` → 136 of 136 tests; lines 96.8%, branches 88.1%
  - Constraint tests: duplicate email, rating 0/6/-1, duplicate review and 14 other cases are
    rejected by PostgreSQL, each asserted by constraint name
  - Seed twice on the test database → 211 games, 12 genres, 2 then 0 demo users; identical row
    counts asserted in `test/seed.e2e-spec.ts`
  - `admin:promote` → promotes `Ana@Checkpoint.test` case-insensitively; unknown email, bad
    argument and missing `SEED_DEMO_PASSWORD` each exit 1 with one line
  - `npm run lint`, `format:check`, `typecheck`, `build` pass; `npm audit --omit=dev` → 0
- Known limitations / open questions:
  - The development database is migrated but not seeded: the seed needs `SEED_DEMO_PASSWORD`
    in `.env`
  - Seven paid games in the snapshot have no US price (no longer sold there); stored as no price
  - The snapshot builder calls Steam and is not covered by tests; its parsing is. P6 adds the
    tested client with backoff and the ADR on Steam's limits.
  - A future sync that adds a game whose slug equals an existing one needs the same collision
    rule against the database, not only within the snapshot (P6)

---

### P0 — Bootstrap — 2026-10-07
- Status: done
- Built:
  - Repository: `.gitignore`, `.nvmrc` (Node 24), `.editorconfig`, `.env.example`,
    `docker-compose.yml` (PostgreSQL 18.6 and Redis 8.10.2 with password, health checks, named
    volumes, ports on 127.0.0.1 only), `.github/workflows/ci.yml`
  - `api` tooling: strict TypeScript, ESLint strict type-checked with bans on `console.*`,
    `$queryRawUnsafe` and `$executeRawUnsafe`, Prettier, Vitest with `unit` and `e2e` projects
    and 85% line and branch thresholds
  - `src/config`: zod environment schema, `AppConfig`, `ConfigModule`
  - `src/common`: `configureApp` (request id, helmet, CORS allow-list, 100 kb JSON body limit,
    `api/v1` prefix, validation pipe, Problem Details filter, shutdown hooks), pino logger
    parameters with redaction
  - `src/prisma`, `src/redis`: minimal clients for the readiness check
  - `src/modules/health`: `GET /health/live`, `GET /health/ready`
- Decisions not dictated by the spec:
  - TypeScript 6.0.3, not the `latest` 7.0.2: `typescript-eslint` 8.71.1 supports `<6.1.0` and
    `@nestjs/cli` 12.0.8 pins `~6.0.2`
  - Prisma 7.10.0: the `prisma` package's `latest` tag pointed at 8.0.0-rc.20, a release
    candidate
  - No SWC in tests: Vitest 5 transforms with Oxc, which emits decorator metadata
    (`docs/adr/0001`)
  - Own `ConfigModule` instead of `@nestjs/config`: `main.ts` parses the environment once
    before Nest starts and exits with code 1 and one line per invalid variable; tests build an
    `AppConfig` without touching `process.env`. One dependency fewer.
  - `PrismaModule` and `RedisModule` start in P0 in minimal form, because `/health/ready` checks
    both. P1 and P5 extend them.
  - `PrismaService` connects on first query instead of on module init (deviation from
    `CONVENTIONS.md`), so the process starts with the database down and readiness reports 503
  - Readiness probes time out after 1 s, so a hanging dependency cannot stall the probe
  - Request id generated by the server in the first middleware, never taken from the client;
    returned in `X-Request-Id` and in Problem Details as `requestId`
  - Problem Details use `type: "about:blank"`. `HttpException` and `http-errors` 4xx errors
    (body parser) are expected and keep their message; anything else becomes a logged, generic 500
  - One `.env` at the repository root, read by Compose, by the `dev` and `start` scripts through
    Node's `--env-file`, and by Vitest for e2e without overriding variables already set
  - PostgreSQL on host port 5433, since 5432 is often taken by another local PostgreSQL
  - Generated Prisma client in `api/src/generated`: git-ignored, rebuilt by `postinstall`,
    excluded from lint, format and coverage
  - CI generates throwaway service passwords per run and masks them
  - npm `overrides`, scoped to the Prisma CLI: `mysql2` 3.24.5 (was 3.15.3) and `deepmerge-ts`
    8.0.2 (was 7.1.5). The CLI pulled versions with high advisories (GHSA-3f6p-5ww8-9rcr,
    GHSA-rgwj-5xj2-c3m3, GHSA-ggr8-5vv4-36mx), and npm counts the CLI as production because
    `@prisma/client` declares it as an optional peer, so `npm audit --omit=dev` failed.
    `deepmerge-ts` 8 changed Map merging and some type names; Prisma only calls `deepmerge` on
    its plain config object, so neither applies. Remove both overrides once Prisma ships fixed
    versions; check on every Prisma upgrade.
- Dependencies added (name@version):
  - Runtime: @nestjs/common@12.1.2, @nestjs/core@12.1.2, @nestjs/platform-express@12.1.2,
    @prisma/adapter-pg@7.10.0, @prisma/client@7.10.0, class-transformer@0.5.1,
    class-validator@0.15.1, helmet@8.3.0, ioredis@6.0.0, nestjs-pino@5.3.1, pino@10.4.0,
    pino-http@11.0.0, reflect-metadata@0.2.2, rxjs@7.8.2, zod@4.6.5
  - Development: @eslint/js@10.0.1, @nestjs/cli@12.0.8, @nestjs/testing@12.1.2,
    @types/express@5.0.6, @types/node@24.19.1, @types/supertest@7.2.1,
    @vitest/coverage-v8@5.0.3, eslint@10.12.0, eslint-config-prettier@10.1.8,
    pino-pretty@13.2.0, prettier@3.9.9, prisma@7.10.0, supertest@7.3.1, typescript@6.0.3,
    typescript-eslint@8.71.1, vitest@5.0.3
- Verification (command → result):
  - `npm run lint`, `format:check`, `typecheck`, `test`, `build` → all pass
  - `npm ci` from a clean tree without `DATABASE_URL` → Prisma client generated, all checks pass
  - `node dist/main.js` without `JWT_SECRET` → `JWT_SECRET: is required`, exit 1; with a short
    one → `JWT_SECRET: must be at least 32 bytes`, exit 1; empty environment → one line per
    missing variable, exit 1. No stack trace, rejected value not echoed.
  - `test/di-toolchain.spec.ts` passes, and fails with `emitDecoratorMetadata` forced off
  - `docker compose up --detach --wait postgres redis` → both healthy, bound to 127.0.0.1;
    PostgreSQL 18 data in `/var/lib/postgresql/18/docker`, inside the named volume
  - `npm run dev`, then `curl /api/v1/health/ready` → 200
    `{"status":"ok","checks":{"database":"up","redis":"up"}}`
  - Request with `Authorization` and `Cookie` headers under `npm run dev` → both logged as
    `[REDACTED]`, values absent from the log, log request id equal to `X-Request-Id`
  - `npm run test:cov` with live services → 46 of 46 tests pass; lines 100%, branches 90.38%
  - `docker compose config --quiet` without `.env` → refuses, naming the missing variable
  - `npm audit --omit=dev --audit-level=high` and `npm audit` → 0 vulnerabilities after the
    overrides; `prisma generate` and `prisma validate` load `prisma.config.ts` and succeed
- Known limitations / open questions:
  - The Prisma CLI is `devOptional`, so it will probably end up in a production image built with
    `npm ci --omit=dev`. To handle with the Dockerfile in P8.
  - Oxc emits a `typeof X === "undefined"` branch for each constructor parameter's metadata;
    these show as uncovered branches in constructors.
  - The pino-http middleware is registered by Nest after the `app.use` middleware, so a request
    rejected by the body parser gets a request id and Problem Details but no request log line
    (confirmed with a 413 under `npm run dev`). To fix in P7, which requires one log line per
    request.
  - e2e tests use the database from `.env`. P1 needs a separate test database before tests write
    data.
  - npm 11 blocks dependency install scripts (`prisma` preinstall, `@prisma/engines`
    postinstall). `prisma generate` works without them; migrations are verified in P1.
  - CI has not run yet: it needs the branch pushed to GitHub.
  - Intermediate P0 commits do not build on their own; the branch as a whole does.
