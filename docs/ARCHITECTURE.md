# Architecture

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js, current LTS |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` |
| Framework | NestJS |
| ORM | Prisma with PostgreSQL |
| Cache, rate limit store, queue backend | Redis |
| Queue | BullMQ through `@nestjs/bullmq` |
| Validation | `class-validator` DTOs for HTTP input; `zod` for environment and external API payloads |
| Auth | Argon2id password hashes, JWT access tokens, rotating opaque refresh tokens |
| Logging | `pino` through `nestjs-pino`, JSON in production |
| Errors | Sentry, enabled only when `SENTRY_DSN` is set |
| Metrics | `prom-client` |
| API docs | `@nestjs/swagger` (OpenAPI) |
| Tests | Vitest and Supertest |
| Web | Vite, React, TypeScript, Tailwind CSS, TanStack Query, React Router |
| Containers | Docker and Docker Compose |
| CI | GitHub Actions |

Resolve the latest stable version of each at install time, pin it, and log it. If a current
major version changed something this document assumes, follow the library's current
documentation and record the difference in an ADR.

## Repository layout

```
.
├── api/
│   ├── prisma/            schema.prisma, migrations/, seed.ts, data/
│   ├── src/
│   │   ├── main.ts        HTTP bootstrap
│   │   ├── worker.ts      queue worker bootstrap (separate process)
│   │   ├── app.module.ts
│   │   ├── config/        env schema and typed config
│   │   ├── common/        guards, decorators, filters, interceptors, pagination, problem details
│   │   ├── prisma/        PrismaModule, PrismaService
│   │   ├── redis/         RedisModule, CacheService
│   │   └── modules/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── games/
│   │       ├── reviews/
│   │       ├── library/
│   │       ├── sync/      queue producer, processor, Steam client
│   │       ├── health/
│   │       └── metrics/
│   └── test/              e2e specs and helpers
├── web/
├── docs/                  these documents, plus adr/
├── docker-compose.yml     postgres, redis, api, worker, web
├── .github/workflows/
└── README.md
```

`api` and `web` are independent npm packages. No monorepo tooling.

## Module rules

- A module has `*.controller.ts`, `*.service.ts`, `dto/`, and tests beside the code
- Controllers do HTTP only: parse input, call one service method, map the result to a response
  DTO. No Prisma in controllers.
- Services own business rules and transactions
- A module reaches another module only through its exported service
- Responses are explicit DTOs built from an allow-list of fields. Never return a Prisma model.

## Request pipeline

1. `helmet`, CORS allow-list, body size limit (100 kb), request id
2. Global rate limiter backed by Redis
3. Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`
4. Global `JwtAuthGuard`; routes opt out with `@Public()`. Then `RolesGuard`.
5. Controller, service
6. Global exception filter that renders Problem Details and hides internals

Authentication is **deny by default**: a new route is protected unless it is explicitly marked
public. This is deliberate, so a forgotten decorator fails closed.

## Authentication design

- Access token: JWT, HS256, 15 minute lifetime, claims `sub`, `role`, `iat`, `exp`, `iss`,
  `aud`. Verification pins the algorithm and checks issuer and audience.
- Refresh token: 256 bits from `crypto.randomBytes`, opaque. Only its SHA-256 hash is stored.
  30 day lifetime.
- Delivery: access token in the response body, held in memory by the web app. Refresh token in
  a cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`.
- Rotation: each refresh revokes the presented token and issues a new one in the same family,
  inside one transaction. Presenting a revoked token revokes the whole family (reuse detection).
- The refresh and logout endpoints also check the `Origin` header against the allow-list.

## Caching

- Cache-aside in `CacheService`, used by `GamesService` for the list, detail and genres reads
- Keys carry a namespace version: `games:v{n}:list:{hash of normalized query}`. Invalidation
  increments `games:version`, which makes every older key unreachable without scanning.
  Old keys expire by TTL.
- TTL of 5 minutes for lists and genres, 10 minutes for details
- Invalidate on sync completion and on any review write (ratings change)
- If Redis is down, reads fall through to PostgreSQL and a warning is logged. Cache failures
  never fail a request.
- Only public data is cached. Nothing per user.

## Background work

- `worker.ts` boots a Nest application context without HTTP and runs the BullMQ processor
- The HTTP process only enqueues. A unique job id prevents two concurrent sync runs.
- Job options: attempts with exponential backoff, `removeOnComplete` and `removeOnFail` limits
- The Steam client has a fixed base URL, a request timeout, a response size cap, and validates
  payloads with zod. It follows no redirects to other hosts.

## Observability

- One JSON log line per request: request id, method, route, status, duration, user id if any.
  Authorization headers, cookies, passwords and tokens are redacted.
- Metrics: HTTP duration histogram by route and status, cache hit and miss counters, sync run
  counters and duration, queue depth
- Sentry receives unhandled errors and 5xx, tagged with the request id, with request bodies
  scrubbed

## Configuration

All configuration comes from environment variables, validated by a zod schema at startup. The
process exits with a clear message if a variable is missing or invalid. No fallback values for
secrets. `JWT_SECRET` must be at least 32 bytes.

## Decisions to record as ADRs

Write a short ADR in `docs/adr/` for each: cursor over offset pagination; opaque rotating
refresh tokens in a cookie; versioned cache keys; curated app list over full crawl; separate
worker process; denormalized rating columns; UUID v7 keys.
