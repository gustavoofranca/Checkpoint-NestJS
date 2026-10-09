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
