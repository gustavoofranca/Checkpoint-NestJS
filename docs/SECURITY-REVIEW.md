# Security review

Phase P8 walked through every rule in `docs/SECURITY.md` and every row of `docs/AI-PITFALLS.md`.
For each rule this file names the code that enforces it and the test or check that proves it.
Paths are relative to the repository root; tests run with `npm run test:cov` in `api/`, and CI
runs them on every push (`.github/workflows/ci.yml`).

Reviewed on 2026-10-14, at the end of P8. The web app does not exist yet (P9): rules that only
apply to it are listed under "Open" at the end.

## 1. Authorization (API1, API3, API5)

| Rule | Enforced by | Proved by |
|---|---|---|
| Deny by default; public routes marked `@Public()` | `JwtAuthGuard` registered as a global guard in `api/src/modules/auth/auth.module.ts` | `authorization.e2e-spec.ts`: 401 without a token, with a malformed one and with an expired one, for every protected route |
| Every route is classified | The two route lists in `authorization.e2e-spec.ts` | "lists every route of the API, and exactly those that require an access token": compares them with the OpenAPI document, so a new route fails until it is added to one list (added in P8) |
| Ownership comes from the token, never the request | `@CurrentUser()` (`api/src/common/auth/auth.decorators.ts`); no DTO has a user id field; `whitelist` and `forbidNonWhitelisted` reject unknown fields | "rejects a body that names a user" (`library.e2e-spec.ts`), "rejects a body that tries to set the role" (`auth.e2e-spec.ts`) |
| Owner in the `where` clause, not checked afterwards | `reviews.service.ts` and `library.service.ts` select by `(userId, gameId)` | "one user cannot touch another user's review" (`reviews.e2e-spec.ts`) and "one user cannot see or change another user's library" (`library.e2e-spec.ts`) |
| Roles checked on the server | `RolesGuard` (global) and `@Roles(Role.ADMIN)` on `admin-sync.controller.ts` | "answers 403 to a USER on an ADMIN route" (`auth.e2e-spec.ts`); 403 for a USER on both admin routes (`admin-sync.e2e-spec.ts`) |
| No mass assignment | Prisma `data` objects built field by field in every service | `grep -rnE "data: *(dto\|body)\|\.\.\.(dto\|body)" api/src` finds nothing; the two tests above |
| No excessive data exposure | Response DTOs and Prisma `select` everywhere; no `include` in `api/src` | `test/support/response-leak-guard.ts` fails any e2e test whose response carries a password or token hash ("flags a response that exposes a password hash"); "never the email" (`profiles.e2e-spec.ts`), "without emails" (`reviews.e2e-spec.ts`) |
| 404 rather than 403 for private resources | A review or library entry that is not the caller's is not found by the owner-scoped query | "answers 404 when the caller has no review of the game" (`reviews.e2e-spec.ts`) |
| Authorization test matrix kept complete | `api/test/README.md` | The completeness test above |

## 2. Authentication (API2)

| Rule | Enforced by | Proved by |
|---|---|---|
| Argon2id at or above OWASP parameters | `api/src/modules/users/password-hasher.ts` (`node:crypto`, m=19 MiB, t=2, p=1; `docs/adr/0003`) | `password-hasher.spec.ts`, including the RFC 9106 test vector |
| Password length 12 to 128, no composition rules | `register.dto.ts` (`@Length(12, 128)`) | `auth.e2e-spec.ts` registration validation cases |
| Never log, return or store a password | Hash only in `users.service.ts`; response DTOs; log redaction | "keeps passwords, tokens and cookies out of the logs of a whole session" (`logging.e2e-spec.ts`); the response leak guard |
| Dummy hash for unknown accounts | `AuthService.login` verifies against `dummyHash` when the email is unknown | "runs one password verification for an unknown email too" |
| Same message for unknown email and wrong password, and for a taken email or username | `INVALID_CREDENTIALS`, `REGISTRATION_CONFLICT` | "answers an unknown email and a wrong password identically", "answers the same 409 for a taken email and a taken username" |
| JWT: algorithm pinned, `exp`, `iss`, `aud` checked, `alg: none` rejected | `auth.module.ts` (`algorithms: ['HS256']`), `access-token.service.ts` | "rejects with 401 a token that": is not a JWT, uses `alg: none`, uses another algorithm, has expired, has another issuer or audience, claims an unknown role, has no subject |
| Secret from the environment, at least 32 bytes, no default | `api/src/config/env.schema.ts` | `app-config.spec.ts`: missing and short `JWT_SECRET` are rejected without echoing the value |
| Refresh tokens hashed, rotated, reuse revokes the family | `refresh-token.service.ts` (`docs/adr/0004`) | "revokes the whole family when a rotated token is reused", "lets only one of two concurrent refreshes with the same token succeed" |
| Tokens never in URLs | Access token in the response body, refresh token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie | "returns an access token and sets the refresh cookie with the required attributes" |

## 3. Input handling and injection (API8, API10)

| Rule | Enforced by | Proved by |
|---|---|---|
| Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform` | `api/src/common/validation/create-validation-pipe.ts` | "rejects a property that is not in the DTO", "lists every invalid field" (`pipeline.e2e-spec.ts`) |
| Every DTO field typed and bounded; route params validated | Input DTOs under `api/src/**/dto`; param DTOs `GameSlugParamDto`, `GameIdParamDto`, `UsernameParamDto` | "answers 400 for a slug with invalid characters", "answers 400 for a game id that is not a UUID", "answers ... 400 for an invalid one" (username) |
| SQL only through the query builder or tagged `$queryRaw` | ESLint `no-restricted-properties` bans `$queryRawUnsafe` and `$executeRawUnsafe` (`api/eslint.config.mjs`); the two raw queries are tagged templates | `npm run lint` in CI |
| `ILIKE` input escaped | `api/src/common/text/escape-like.ts` | "treats %s literally" (`games.e2e-spec.ts`) |
| No `eval`, `new Function`, `child_process`, dynamic `require` | Not used | `grep -rnE "eval\(\|new Function\|child_process" api/src` finds only ioredis' `eval` of a fixed Lua script (`redis-throttler.storage.ts`) |
| No regular expression from user input | Patterns are literals | `grep -rn "new RegExp" api/src` finds nothing |
| Steam data validated, HTML stripped, lengths capped, image hosts allow-listed over HTTPS | `normalize-steam-app.ts`, `steam-app-details.schema.ts`, `strip-html.ts` | `normalize-steam-app.spec.ts`: "strips HTML from text fields", "rejects an image URL from a host outside the allow-list", "rejects an image URL over plain http", "truncates a long description" |
| Review bodies stored and returned as plain text | No HTML is produced anywhere; responses are JSON | `reviews.e2e-spec.ts` round-trips the body unchanged |

## 4. Resource consumption (API4, API6)

| Rule | Enforced by | Proved by |
|---|---|---|
| Global rate limit in Redis, keyed by IP; stricter on login, register, refresh by IP and account | `api/src/rate-limit` (`docs/adr/0008`) | `rate-limit.e2e-spec.ts`: 6th login per account, 31st credential request per IP, 301st request a minute |
| `limit` capped at 50; every list paginated | `pagination-query.dto.ts`; cursor pagination in every list service | `limit=51` answers 400 (`games.e2e-spec.ts`) |
| JSON body limit 100 kb | `configure-app.ts` | "rejects a JSON body over 100 kb with Problem Details" |
| Request timeout on the server | `configure-app.ts`: headers within 10 s, the whole request within 30 s (added in P8) | "bounds how long a client may take to send its headers and its request" |
| Timeout and size cap on outbound calls | `steam-client.ts`: 10 s, 2 MB enforced while reading | `steam-client.spec.ts`: hanging request, oversized body with and without Content-Length |
| `trust proxy` set explicitly | `TRUST_PROXY_HOPS` (`env.schema.ts`, `configure-app.ts`) | "ignores X-Forwarded-For when no proxy is trusted", "counts each client IP separately" |
| Starting a sync is admin only and rejected while one runs | `admin-sync.controller.ts`, `running_lock` unique column (`docs/adr/0010`) | 403 for a USER and 409 while a run is active (`admin-sync.e2e-spec.ts`); "lets only one of two simultaneous starts succeed" |

## 5. Server-side request forgery (API7)

| Rule | Enforced by | Proved by |
|---|---|---|
| Outbound requests only to the fixed Steam host; only a validated integer from outside | `steam-client.ts` builds the URL from a constant and an app id checked to be a positive integer | "refuses an app id that is not a positive integer before any request" |
| No redirects followed | `redirect: 'manual'`; a 3xx is rejected | "does not follow a redirect to another host" |

## 6. Configuration and transport (API8)

| Rule | Enforced by | Proved by |
|---|---|---|
| `helmet` with defaults | `configure-app.ts` | "sets helmet headers and hides the framework" |
| CORS allow-list, never `*` or reflected | `configure-app.ts`, `CORS_ORIGINS` | "allows an origin from the allow-list with credentials", "does not allow or reflect any other origin" |
| Swagger off in production unless enabled | `setup-openapi.ts` | `games.e2e-spec.ts`: 404 in production, 200 with `ENABLE_DOCS=true` |
| No stack traces, SQL, Prisma text or paths in errors; generic 500 with the request id | `ProblemDetailsFilter`, `problem-details.ts` | "hides the message of an unexpected error and keeps the request id"; `logging.e2e-spec.ts` checks the same id is in the log |
| Unique-constraint errors become 409 with a safe message | Services map their known cases; any other P2002 is mapped globally in `problem-details.ts` (added in P8) | "turns a unique constraint violation into a 409 that does not name the columns" (`problem-details.spec.ts`) |
| Production disables verbose errors and pretty logs | Errors are never verbose; `pino-pretty` only when `NODE_ENV=development` | "pretty-prints only in development" (`create-logger-params.spec.ts`) |
| Non-root, slim pinned image, multi-stage, no dev dependencies, no source maps | `api/Dockerfile` (base image pinned by digest) | CI job "Production image": checks the uid, absent dev packages, source maps, sources and `.env` |
| PostgreSQL and Redis not published; Redis password | `docker-compose.prod.yml` | Checked by hand in P8: `docker compose ps` showed no host port for either; Redis requires `REDIS_PASSWORD` |
| Application database user without DDL rights; migrations with a separate role | `deploy/postgres/10-app-role.sh`; the `migrate` service uses the owner role, the API and worker `APP_DB_USER` | Checked by hand in P8: as the app role, `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE` and `TRUNCATE` were refused; seed, login and catalog worked |

## 7. Secrets

| Rule | Enforced by | Proved by |
|---|---|---|
| Only from environment variables; `.env` git-ignored | `env.schema.ts`, `cli-config.ts`; `.gitignore` | gitleaks in CI over the full history (63 commits, no leaks, at the time of this review) |
| `.env.example` lists every variable | `.env.example` | "documents every variable read by the API, the CLIs and the compose files, and no other" (`test/repository-rules.spec.ts`, added in P8) |
| Logs redact credentials | `REDACTED_PATHS` in `create-logger-params.ts` | "redacts credentials before they reach the log output"; the whole-session log test |
| Secret scanner in CI | gitleaks job in `ci.yml` (added in P8) | The job itself |

## 8. Dependencies and supply chain

| Rule | Enforced by | Proved by |
|---|---|---|
| Packages verified before install | `npm view` before each install; versions and reasons recorded per phase in `docs/PROGRESS.md` | The PROGRESS entries. In P7 this caught `prom-client` being deprecated; its successor `@prometheus-io/client` is used |
| Exact versions, committed lockfile, `npm ci` in CI and Docker | `api/package.json`, `api/package-lock.json`, `ci.yml`, `Dockerfile` | "pins every npm dependency to an exact version" (`repository-rules.spec.ts`) |
| `npm audit --omit=dev --audit-level=high` fails the build | `ci.yml` (added in P8) | The CI step; 0 vulnerabilities at the time of this review |
| Dependabot for npm, Docker and Actions | `.github/dependabot.yml` (added in P8) | GitHub's Dependabot tab once pushed |
| Actions pinned to a SHA; least-privilege permissions | `ci.yml`, `codeql.yml`: `permissions: contents: read`, `security-events: write` only on the CodeQL job | "pins every GitHub Action to a commit SHA" (`repository-rules.spec.ts`) |
| Static analysis | CodeQL with the `security-extended` queries (`codeql.yml`, added in P8) | GitHub code scanning once pushed |

## 9. Data integrity

| Rule | Enforced by | Proved by |
|---|---|---|
| Unique, foreign keys with `onDelete`, CHECK constraints, NOT NULL | `api/prisma/schema.prisma` and the migrations | `database-constraints.e2e-spec.ts` |
| Multi-step writes in a transaction | Review write plus rating aggregate (`reviews.service.ts`, `docs/adr/0006`); refresh rotation | "keeps the rating exact when many users review the same game at once"; the concurrent refresh test |
| Concurrent duplicates resolved by constraints | Unique `(user_id, game_id)` on reviews; `running_lock` on sync runs; atomic token claim | "leaves exactly one review when the same user sends two PUTs at once", "lets only one of two simultaneous starts succeed" |
| Forward-only migrations, `migrate deploy`, no `db push` | `prisma/migrations`; `db:migrate` script; the `migrate` image | `npm run db:drift` in CI fails if the migrations do not produce the schema |

## 10. Logging and audit (API9)

| Rule | Enforced by | Proved by |
|---|---|---|
| Authentication events and admin actions logged with user id and request id, no other personal data | `api/src/common/logging/audit-log.ts` (`docs/adr/0011`) | `logging.e2e-spec.ts`: sign-up and sign-in, failed logins, refresh reuse, logout, admin starting a sync |
| Never log request bodies on auth routes | pino-http logs no bodies | The whole-session log test (no password or email in any line) |
| No old API versions; OpenAPI is the inventory | Single `/api/v1` prefix; `api/openapi.json` committed (added in P8) | `openapi.e2e-spec.ts` fails while the committed document differs from the served one |

## AI-PITFALLS walkthrough

Security rows map to the sections above. The others:

| Mistake | Status |
|---|---|
| Package that does not exist, or an API from another major version | Every dependency checked with `npm view`; library APIs read from installed type definitions (for example Sentry 11's `dataCollection`, which replaced `sendDefaultPii`) |
| Library for something the platform does | `node:crypto` for Argon2id, random tokens and hashes; `fetch` for Steam; Prisma's `uuid(7)` for ids |
| Deprecated packages | `prom-client` replaced by `@prometheus-io/client` in P7 |
| Happy-path-only tests, tests that mock what they test | e2e tests run against real PostgreSQL and Redis; Steam is replaced at the HTTP boundary by a local server; negative controls run in P7 and P8 (Sentry scrubbing, OpenAPI drift, error logging) |
| `any`, casts, non-null assertions, `@ts-ignore`, `eslint-disable`, `TODO`, `console.log` | Lint errors in CI: `no-explicit-any`, `no-unsafe-*`, `no-non-null-assertion`, `ban-ts-comment`, `no-console`. `grep -rnE "@ts-ignore\|@ts-expect-error\|eslint-disable\|TODO\|FIXME\|console\.log\|as any" api/src api/test` finds nothing outside the generated client; "any" appears only as an English word in comments and test names |
| N+1 queries | "runs the same small number of queries for any page size" (`games.e2e-spec.ts`) |
| Missing indexes | One index per filter and sort, with `EXPLAIN` output in `docs/query-plans/catalog.md` |
| Money and ratings in floating point; local dates | Integer cents; `numeric(3,2)` averages; `timestamptz` and ISO 8601 |
| Swallowed errors | Catches either handle a known case or rethrow; in P7 the error log line was found to lose the message and stack and was fixed |
| Dead code and unused exports | No unused dependency; constants exported but used only in their module made private in P8 |

## Gaps found and fixed in P8

- No server-side request timeout: Node's defaults (60 s for headers, 5 minutes per request) are
  now 10 s and 30 s.
- A unique-constraint error not handled by a service became a 500; it is now a 409 with a safe
  message.
- The authorization matrix depended on someone adding each new route to it; a test now checks
  it against the OpenAPI document.
- The production image could not load the Prisma client: generation inside Docker inferred
  `.ts` import extensions. The extension is now pinned in `schema.prisma`.
- `.env.example`, exact versions and action pins were checked by eye only; they are tested now.
- CI had no dependency audit, secret scan, image check or static analysis.

## Open

- **Web app (P9)**: strict Content-Security-Policy, no secret or token in the bundle or in
  `localStorage`, review bodies rendered as text without `dangerouslySetInnerHTML`.
- **Production compose checks are manual**: published ports and the app role's privileges were
  verified by hand, not by a test.
- **The app role can write `_prisma_migrations`**, because default privileges cover every table
  the owner creates. Changing migration history needs SQL the API never runs; restricting it
  would mean a revoke after each migration.
- **CodeQL and Dependabot results** exist only once the branch is pushed to GitHub.
