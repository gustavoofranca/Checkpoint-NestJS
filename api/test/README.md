# Tests

## Layout

| Kind | Where                                                                     | Runs against              |
| ---- | ------------------------------------------------------------------------- | ------------------------- |
| Unit | `src/**/*.spec.ts`, beside the code; `test/**/*.spec.ts` for test helpers | Nothing external          |
| e2e  | `test/*.e2e-spec.ts`, through HTTP with Supertest                         | Real PostgreSQL and Redis |

- `npm test` runs the unit project, `npm run test:e2e` the e2e project, `npm run test:cov` both
  with coverage (85% lines and branches, enforced).
- e2e tests use the database named in `DATABASE_URL` with `_test` appended
  (`checkpoint_test`). `support/global-setup.ts` creates it when missing and applies the
  migrations; the development database is never touched.
- Each e2e file resets the tables it uses (`support/database.ts`). Files run one at a time;
  tests inside a file do not depend on order.
- `support/create-test-app.ts` builds the application with the same `configureApp` as
  `main.ts`, so tests cross the real pipeline: request id, helmet, CORS, body limit, validation,
  global guards, Problem Details.
- `support/e2e-setup.ts` fails any e2e test whose responses contained a password hash, a token
  hash or an Argon2 string (`support/response-leak-guard.ts`).
- Only Steam is mocked, at the HTTP boundary (from P6).

## Authorization matrix

Required by `docs/SECURITY.md` section 1 for every route that is not public. Each cell names the
test that proves it, in `test/auth.e2e-spec.ts` unless stated.

| Route                | Requires                                 | No credential                                                        | Malformed or expired                                                                                                                                                                | Wrong role                         | Another user                                                             |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `GET /auth/me`       | access token                             | 401: "answers 401 without a token"                                   | 401: the ten cases under "rejects with 401 a token that" (not a JWT, other scheme, expired, other secret, `alg: none`, other algorithm, issuer, audience, unknown role, no subject) | Not applicable: open to every role | Not applicable: the user id comes from the token, never from the request |
| `POST /auth/refresh` | refresh cookie and allow-listed `Origin` | 401: "answers 401 to a refresh with no cookie"; 403 without `Origin` | 401: unknown, expired, reused or revoked token                                                                                                                                      | Not applicable                     | Not applicable: a token only ever renews its own family                  |
| `POST /auth/logout`  | allow-listed `Origin`                    | 204 by design: logout is idempotent                                  | 204, nothing to revoke                                                                                                                                                              | Not applicable                     | Not applicable                                                           |

The global guard itself is covered with test-only routes (`support/probe.controller.ts`):
a signed-in USER reaches an authenticated route, gets 403 on an ADMIN route, and reaches it after
a promotion followed by a refresh; without a token both answer 401.

### Public routes

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (they act on
credentials or the cookie, not on an access token), `GET /games`, `GET /games/:slug`,
`GET /genres` (the catalog is readable by anyone), `GET /health/live`, `GET /health/ready`,
and `GET /docs` with `/docs/openapi.json` (off in production unless `ENABLE_DOCS=true`).
