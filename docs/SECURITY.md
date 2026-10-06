# Security rules

These rules are binding. When a rule conflicts with convenience, the rule wins. Each section
maps to the OWASP API Security Top 10 (2023).

## 1. Authorization (API1, API3, API5)

- Deny by default. `JwtAuthGuard` is global; public routes are marked `@Public()` explicitly.
- Ownership comes from the token, never from the request. The user id for a write is always
  `request.user.sub`. Never accept `userId`, `role`, `id` or `authorId` in a body or query.
- Every query that touches user-owned rows filters by the owner in the `where` clause. Do not
  fetch by id and compare afterwards.
- Role checks use `@Roles()` and `RolesGuard` on the server. The UI hiding a button is not a
  control.
- Mass assignment: build Prisma `data` objects field by field. Never spread a DTO or a request
  body into `create`, `update` or `where`.
- Excessive data exposure: every response goes through a response DTO with an explicit field
  list. `passwordHash`, `email` of other users, token hashes and internal flags never leave
  the API. Use Prisma `select`, not `include` of whole relations.
- Returning 404 instead of 403 for resources the caller may not know about is acceptable and
  preferred for private resources.

### Authorization test matrix

For every route that is not public there must be e2e tests for: no token (401), malformed or
expired token (401), valid token with the wrong role (403), and, for owned resources, a valid
token of another user (the other user's data is unchanged). Keep the matrix as a table in
`api/test/README.md` and keep it complete.

## 2. Authentication (API2)

- Passwords: Argon2id with parameters at or above current OWASP guidance. Minimum length 12,
  maximum 128. No composition rules. Never log, return or store a password in plain text.
- Login compares in constant time and performs a dummy hash verification when the user does
  not exist, so timing does not reveal accounts.
- Login and register return the same generic message for "unknown email" and "wrong password"
  and for "email taken" where the flow allows it.
- JWT: pin the algorithm on verification, validate `exp`, `iss` and `aud`, reject `alg: none`.
  The secret comes from the environment, is at least 32 random bytes, and has no default.
- Refresh tokens are stored hashed, rotated on every use, and reuse revokes the family. See
  `ARCHITECTURE.md`.
- Tokens never go in URLs or in `localStorage`.

## 3. Input handling and injection (API8, API10)

- Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`,
  `transform: true`. Every DTO field has a type, a length or range bound, and a format where
  one applies. Route params are validated too (`ParseUUIDPipe`, slug pattern).
- SQL only through Prisma's query builder or tagged-template `$queryRaw`. `$queryRawUnsafe`
  and `$executeRawUnsafe` are forbidden. No string concatenation into SQL, ever.
- Search input used with `ILIKE` has `%`, `_` and `\` escaped.
- No `eval`, `new Function`, `child_process` with user input, or dynamic `require`.
- No regular expression built from user input. Avoid patterns with nested quantifiers.
- Data from Steam is untrusted input: validate with zod, strip HTML from text fields, cap
  lengths, and accept image URLs only from an allow-list of Steam CDN hosts over HTTPS.
- Review bodies are stored as plain text and rendered as text. The API never returns HTML.

## 4. Resource consumption (API4, API6)

- Global rate limit backed by Redis, keyed by IP. Stricter limits on `/auth/login`,
  `/auth/register` and `/auth/refresh`, keyed by IP and by account identifier.
- `limit` is capped at 50 on every list endpoint. Every list endpoint is paginated. No
  endpoint returns an unbounded collection.
- JSON body limit of 100 kb. Request timeout on the server. Timeout and size cap on outbound
  HTTP calls.
- Behind a proxy, configure `trust proxy` explicitly to the known hop count; do not trust
  `X-Forwarded-For` blindly.
- Starting a sync is admin only and rejected while another run is active.

## 5. Server-side request forgery (API7)

- The server makes outbound requests only to the fixed Steam store host. No URL, host or path
  segment in an outbound request comes from user input except a validated integer app id.
- Redirects are not followed to other hosts.

## 6. Configuration and transport (API8)

- `helmet` with defaults, plus a strict Content-Security-Policy on the web app
- CORS: explicit origin allow-list from the environment, `credentials: true` only for those
  origins. Never `origin: '*'`, never reflect the request origin.
- Swagger UI is off in production unless explicitly enabled
- Error responses never contain stack traces, SQL, Prisma error text or file paths. The
  exception filter maps known errors and returns a generic 500 with the request id otherwise.
  Prisma unique-constraint errors become 409 with a safe message.
- `NODE_ENV=production` disables verbose errors and pretty logging
- Containers run as a non-root user, from a slim pinned base image, with a multi-stage build
  that ships no dev dependencies and no source maps to the public
- PostgreSQL and Redis are not published on host ports in the production compose file. Redis
  requires a password.
- The database user of the application has no superuser or DDL rights in production;
  migrations run with a separate role

## 7. Secrets

- Read only from environment variables. `.env` is git-ignored from the first commit.
- `.env.example` holds every variable with a fake value and a comment
- No secret in the web bundle. Anything prefixed `VITE_` is public by definition.
- Logs redact `authorization`, `cookie`, `set-cookie`, `password`, `token`, `refreshToken`
- CI runs a secret scanner (gitleaks) on every push

## 8. Dependencies and supply chain

- Verify every package before installing it: it exists, has real usage, a repository, and a
  recent release. Prefer packages maintained by the framework's own organisation.
- Exact versions, committed lockfile, `npm ci` in CI and in Docker
- `npm audit --omit=dev --audit-level=high` fails the build
- Dependabot is configured for npm, Docker and GitHub Actions
- GitHub Actions are pinned to a commit SHA and the workflow uses least-privilege `permissions`

## 9. Data integrity

- Constraints live in the database, not only in code: unique, foreign keys with explicit
  `onDelete`, CHECK for rating range, NOT NULL wherever a value is required
- Multi-step writes run in a transaction (review write plus rating aggregate; refresh rotation)
- Concurrent duplicate writes are resolved by the unique constraint and handled, not by a
  read-then-write check
- Migrations are forward-only files generated by `prisma migrate dev` and applied with
  `prisma migrate deploy`. Never edit an applied migration. Never use `db push`.

## 10. Logging and audit (API9 inventory, monitoring)

- Log authentication events (login success and failure, refresh reuse detected, logout) and
  admin actions, with user id and request id, without personal data beyond the user id
- Never log request bodies on auth routes
- Old API versions are not left running; the OpenAPI document is the inventory of endpoints

## Phase P8 checklist

The hardening phase walks through every section above and records, for each rule, the file
that enforces it and the test that proves it, in `docs/SECURITY-REVIEW.md`.
