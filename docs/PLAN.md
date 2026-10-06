# Plan

Eleven phases. Each ends with a stop, the report from `CLAUDE.md`, and a review by the owner.
Phases P0 to P8 are the complete back end. P9 and P10 can follow later.

Estimates are owner review time, not agent time.

---

## P0 — Bootstrap (1–2 h)

Build
- Repository skeleton from `ARCHITECTURE.md`, `.gitignore` (with `.env`) as the first commit
- `api`: NestJS project, strict TypeScript, ESLint, Prettier, Vitest with the SWC plugin
- Config module with the zod environment schema; `.env.example`
- `docker-compose.yml` with PostgreSQL and Redis (password set), health checks, named volumes
- `nestjs-pino` logging with request id and redaction
- Global validation pipe, Problem Details exception filter, `helmet`, CORS allow-list, body limit
- `/health/live` and `/health/ready`
- CI workflow with lint, type check, test and build

Accept
- `docker compose up -d` then `npm run dev` serves `/api/v1/health/ready` with 200
- Starting without `JWT_SECRET`, or with a short one, exits with a clear message (tested)
- An unknown route returns Problem Details JSON, with no stack trace
- A unit test that resolves a provider through Nest DI passes under Vitest
- CI is green

## P1 — Database (1–2 h)

Build
- `schema.prisma` for the whole model in `SPEC.md`, with mapped names
- Migrations, including `pg_trgm`, the trigram index and CHECK constraints as raw SQL
- `PrismaModule`; UUID v7 generation
- Seed command loading the bundled snapshot (about 200 games, genres) and two demo users
- `admin:promote` CLI command

Accept
- `prisma migrate deploy` on an empty database succeeds, and `prisma migrate diff` shows no drift
- Seed is idempotent: running it twice leaves the same row counts
- Tests prove the constraints: duplicate email, rating of 6, duplicate review all fail at the
  database level
- ADR for UUID v7 written

## P2 — Authentication (2–3 h)

Build
- `users` and `auth` modules: register, login, refresh, logout, me
- Argon2id, JWT access token, rotating refresh token with reuse detection
- Global `JwtAuthGuard`, `@Public()`, `@Roles()`, `RolesGuard`, `@CurrentUser()`
- Refresh cookie attributes and `Origin` check as specified

Accept
- e2e: full flow of register, login, me, refresh, logout
- e2e: reusing a rotated refresh token returns 401 and revokes the family
- e2e: expired, malformed and wrong-signature tokens, and `alg: none`, all return 401
- e2e: a body containing `role: "ADMIN"` on register is rejected with 400
- Login responses for unknown email and wrong password are identical in body and status
- No response in the suite contains `passwordHash` (asserted by a shared helper)
- ADR for the refresh token design written

## P3 — Catalog (2 h)

Build
- `games` module: list with search, genre filter and three sorts; detail by slug; genres
- Generic cursor pagination helper in `common/` with encode, decode and validation
- Response DTOs and complete Swagger annotations

Accept
- e2e: paging through the whole seed with `limit=7` yields every game once, in order, for
  each sort
- e2e: invalid cursor, `limit=0`, `limit=51`, and `q` of one character return 400
- e2e: `q` containing `%`, `_` and a quote is treated literally and does not error
- A test asserts the list endpoint runs a bounded number of queries regardless of page size
- `EXPLAIN` output for search and each sort, showing index use, saved in the phase report
- ADR for cursor pagination written

## P4 — Reviews, library, profiles (2–3 h)

Build
- `reviews` module with upsert and delete of the caller's review, transactional rating update
- `library` module
- Public profile endpoint

Accept
- e2e: after create, update and delete of reviews by several users, `ratingAverage` and
  `ratingCount` match a fresh aggregate query
- e2e: two concurrent PUTs by the same user leave exactly one review
- Authorization matrix complete for every protected route so far, in `api/test/README.md`
- e2e: user A's token cannot change or delete anything of user B
- The profile response never includes an email
- ADR for denormalized ratings written

## P5 — Cache and rate limiting (2 h)

Build
- `RedisModule` and `CacheService` with versioned keys, applied to catalog reads
- Invalidation on review writes
- Redis-backed throttler: global limit, stricter auth limits
- Cache hit and miss counters (wired to metrics in P7)

Accept
- e2e: second identical list request is served from cache (asserted through a spy on Prisma or
  the hit counter)
- e2e: after a review write, the game detail shows the new rating immediately
- e2e: with Redis stopped, catalog reads still return 200
- e2e: the 6th failed login in the window returns 429 with `Retry-After`
- ADR for versioned cache keys written

## P6 — Catalog sync (2–3 h)

Build
- Before coding: verify the Steam endpoint's current response shape and limits; write the ADR
- Steam client with fixed host, timeout, size cap, zod validation, backoff
- BullMQ queue, repeatable daily job, processor in `worker.ts`, `SyncRun` records
- Admin endpoints; cache invalidation at the end of a run
- `worker` service in Docker Compose

Accept
- Tests with a mocked HTTP layer: a normal run, a run where some games are malformed (counted
  and skipped), a 429 followed by success, and a full outage (run marked `FAILED`)
- HTML in a description is stripped; an image URL from an unlisted host is rejected
- e2e: `POST /admin/sync` returns 403 for a USER and 409 while a run is active
- One real run against Steam for 10 app ids, executed manually, with the result in the report
- ADR for the curated list and the separate worker written

## P7 — Observability (1–2 h)

Build
- `/metrics` with HTTP histogram, cache counters, sync and queue metrics, protected by token
- Sentry integration behind `SENTRY_DSN`, with scrubbing
- Auth and admin audit log events

Accept
- `/metrics` returns 401 without the token and Prometheus text with it
- Test: a forced 500 is logged with the request id, and the response body carries the same id
  and nothing internal
- Test: logs of a login request contain no password, token or cookie
- The app starts and works with `SENTRY_DSN` unset

## P8 — Hardening and review (2–3 h)

Build
- Walk through `SECURITY.md` and `AI-PITFALLS.md` rule by rule; fix gaps
- `docs/SECURITY-REVIEW.md` with the enforcing file and the proving test for each rule
- Production Dockerfile (multi-stage, non-root) and `docker-compose.prod.yml`
- CI additions: `npm audit`, gitleaks, Docker build, OpenAPI drift check, CodeQL, Dependabot
- Load test script (autocannon or k6) for cached and uncached catalog reads
- Remove dead code and unused dependencies

Accept
- Coverage at or above 85%; CI fully green
- `npm audit --omit=dev` reports no high or critical issue
- The production image runs as a non-root user and contains no dev dependencies
- Load test results meet the bars in `SPEC.md`, or the gap is explained
- A search of the codebase finds no `any`, `@ts-ignore`, `eslint-disable`, `TODO`,
  `console.log` or `Unsafe(`

## P9 — Web UI (3–4 h)

Build
- The four screens in `DESIGN.md`, with tokens, states and accessibility as specified
- Typed API client, in-memory session with silent refresh, CSP
- `web` service in Docker Compose

Accept
- A new visitor can browse, search, sign up, review a game and see it on their profile
- Lighthouse accessibility score of 95 or more on catalog and game screens
- Usable at 360 px width and by keyboard alone
- Nothing in `localStorage`; no `dangerouslySetInnerHTML` in the code
- Screenshots captured for the README

## P10 — Documentation and release (1–2 h)

Build
- README following `DOCUMENTATION.md`, written from the code as it is
- Root `SECURITY.md`, `CHANGELOG.md`, MIT license, final ADR index
- Optional: deployment guide for a single VPS (Docker Compose behind Nginx with TLS)

Accept
- Quick start verified from a fresh clone on a machine with only Docker
- Every command and number in the README was run and matches
- Every link in the docs resolves
- Tag `v1.0.0`
