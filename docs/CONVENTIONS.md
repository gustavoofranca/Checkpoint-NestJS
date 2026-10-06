# Conventions

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`
- No `any`, no `@ts-ignore`, no non-null assertion. `unknown` plus narrowing at boundaries.
- Named exports. One class per file. File names in kebab-case with the Nest suffix
  (`games.service.ts`, `create-review.dto.ts`).
- Functions do one thing and are short. Early returns over nested conditionals.
- Domain errors are thrown as Nest HTTP exceptions from services, with safe messages
- ESLint with `typescript-eslint` strict type-checked rules, and Prettier. A lint rule bans
  `$queryRawUnsafe`, `$executeRawUnsafe` and `console.*`.

## NestJS

- Constructor injection only. No service locator, no static state.
- Configuration through a typed config service, never `process.env` outside `config/`
- DTOs for every body, query and params object, with Swagger decorators so the OpenAPI
  document is complete and accurate
- Decorators and Vitest: Nest relies on decorator metadata, which the default Vitest
  transformer does not emit. Configure the SWC plugin for Vitest and verify dependency
  injection works in the first test before writing more.

## Prisma

- `schema.prisma` is the source of truth. Model names in PascalCase, columns mapped to
  snake_case with `@map`, tables with `@@map`.
- Raw SQL appears only in migrations (extensions, trigram index, CHECK constraints) and is
  commented with its reason
- Always `select` the fields needed. Never return a model directly.
- One `PrismaService`, connected on module init and closed on shutdown

## Tests

- Unit tests beside the code (`*.spec.ts`) for services and pure functions
- e2e tests in `api/test` (`*.e2e-spec.ts`) through HTTP with Supertest, against real
  PostgreSQL and Redis from Docker Compose locally and service containers in CI
- Each e2e file resets the tables it uses. Tests do not depend on order or on each other.
- Test data comes from small factory functions, not shared fixtures
- The Steam client is the only thing mocked, at the HTTP boundary
- Names describe behaviour: `returns 409 when a sync is already running`
- Coverage thresholds of 85% lines and branches enforced in the Vitest config

## Git

- Conventional Commits: `feat(auth): rotate refresh tokens`. Subject in the imperative, under
  72 characters. Body explains why when it is not obvious.
- Small commits, one concern each. No "wip", no "fix stuff", no giant initial commit.
- A branch per phase (`phase/p2-auth`), merged by the repository owner after review
- Never commit generated output (`dist`, coverage), `.env`, or editor folders
- No co-author trailers or tool advertisements in commit messages

## CI (GitHub Actions)

One workflow, jobs in this order, each failing the build:

1. Install with `npm ci`
2. Lint and format check
3. Type check
4. Prisma migrate deploy against the service container, then unit and e2e tests with coverage
5. Build
6. `npm audit --omit=dev --audit-level=high`
7. Secret scan with gitleaks
8. Docker image build

CodeQL runs as a separate scheduled workflow.

## Scripts every package exposes

`dev`, `build`, `start`, `lint`, `format`, `typecheck`, `test`, `test:e2e`, `test:cov`. The API
adds `db:migrate`, `db:seed`, `worker`, and `admin:promote <email>`.
