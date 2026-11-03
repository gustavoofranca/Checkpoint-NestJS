# Changelog

One entry per phase of [docs/PLAN.md](docs/PLAN.md). The detailed log, with the verification of
each phase, is in [docs/PROGRESS.md](docs/PROGRESS.md).

## 1.0.0 — 2026-11-03

### P10 — Documentation and release

- README with the quick start, API overview, engineering notes, measured test and load numbers
- Root `SECURITY.md`, this changelog, the MIT license and an index of the ADRs
- One-shot `seed` service in `docker-compose.prod.yml`, so the quick start needs only Docker
- Fix: the `web` service of `docker-compose.prod.yml` started nginx with no server (its tmpfs
  was not writable by nginx); it now serves and has a health check

### P9 — Web UI — 2026-11-03

- React web app (`web/`): catalog with search, genre filter, sort and a Top rated row, game pages
  with reviews, the library status control, sign-in and sign-up, public profiles
- API client typed from the committed OpenAPI document; session held in memory
- Served by unprivileged nginx with a strict Content Security Policy, same origin as the API
- `GET /games/:slug/reviews/me` and `GET /me/library/:gameId`; demo reviews in the seed

### P8 — Hardening and review — 2026-10-14

- Security review of every rule, with the enforcing code and the proving test
- Production Dockerfile (non-root, digest-pinned base) and `docker-compose.prod.yml` with an
  application database role that cannot change the schema
- CI: `npm audit`, secret scan, CodeQL, production image build, Dependabot
- Committed `openapi.json` with a drift check; k6 load test; server and request timeouts

### P7 — Observability — 2026-10-14

- Prometheus metrics behind `METRICS_TOKEN`, optional Sentry reporting with data collection off
- Audit log events for authentication and admin actions; route pattern and user id in request logs

### P6 — Catalog sync — 2026-10-13

- Steam client with a fixed host, timeouts, size cap, retries and payload validation
- Separate worker process on a BullMQ queue, daily schedule, `POST /admin/sync` and its run history
- One running sync at a time, enforced by PostgreSQL

### P5 — Cache and rate limiting — 2026-10-13

- Cache-aside in Redis with versioned keys, invalidated after review writes commit
- Rate limits in Redis, failing closed on credential routes; `TRUST_PROXY_HOPS` for the client IP

### P4 — Reviews, library, profiles — 2026-10-09

- One review per user and game with denormalized ratings recomputed under a row lock
- Personal library with a status per game; public profiles
- Authorization test matrix over every protected route

### P3 — Catalog — 2026-10-09

- `GET /games` with title search, genre filter and three sorts, `GET /games/:slug`, `GET /genres`
- Keyset pagination everywhere; Swagger UI and the OpenAPI document

### P2 — Authentication — 2026-10-09

- Register, login, refresh with rotation and reuse detection, logout, `GET /auth/me`
- Short-lived JWT access tokens; opaque refresh tokens in an `HttpOnly` cookie

### P1 — Database — 2026-10-09

- Prisma schema and initial migration; UUID v7 keys; Argon2id password hashing
- Curated list of 211 Steam games, an offline snapshot and an idempotent seed

### P0 — Bootstrap — 2026-10-07

- NestJS API with strict TypeScript, linting, validated configuration, Problem Details errors,
  structured logs, health checks, Docker Compose for PostgreSQL and Redis, and CI
