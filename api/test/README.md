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

Required by `docs/SECURITY.md` section 1 for every route that is not public.

`test/authorization.e2e-spec.ts` holds one table, `PROTECTED_ROUTES`, with every route that needs
an access token, and runs three cases against each: no token, a malformed token, an expired
token, all 401. A new protected route is added to that table and to this one.

| Route                            | Requires                                 | No token / malformed / expired                                                                               | Wrong role                 | Another user                                                                                              |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /auth/me`                   | access token                             | 401 (`authorization.e2e-spec.ts`); ten forged-token cases in `auth.e2e-spec.ts`                              | Not applicable: every role | Not applicable: the id comes from the token                                                               |
| `PUT /games/:slug/reviews/me`    | access token                             | 401 (`authorization.e2e-spec.ts`)                                                                            | Not applicable: every role | "writing "me" creates the caller's own review and leaves the other one unchanged" (`reviews.e2e-spec.ts`) |
| `DELETE /games/:slug/reviews/me` | access token                             | 401 (`authorization.e2e-spec.ts`)                                                                            | Not applicable: every role | "deleting "me" never removes someone else's review" (`reviews.e2e-spec.ts`)                               |
| `GET /me/library`                | access token                             | 401 (`authorization.e2e-spec.ts`)                                                                            | Not applicable: every role | "lists only the caller's entries" (`library.e2e-spec.ts`)                                                 |
| `PUT /me/library/:gameId`        | access token                             | 401 (`authorization.e2e-spec.ts`)                                                                            | Not applicable: every role | "setting a status writes the caller's entry and leaves the other one unchanged" (`library.e2e-spec.ts`)   |
| `DELETE /me/library/:gameId`     | access token                             | 401 (`authorization.e2e-spec.ts`)                                                                            | Not applicable: every role | "removing a game from "my" library leaves another user's entry in place" (`library.e2e-spec.ts`)          |
| `POST /auth/refresh`             | refresh cookie and allow-listed `Origin` | 401 without or with an unknown, expired, reused or revoked cookie; 403 without `Origin` (`auth.e2e-spec.ts`) | Not applicable             | Not applicable: a token only renews its own family                                                        |
| `POST /auth/logout`              | allow-listed `Origin`                    | 204 by design: logout is idempotent; 403 from another origin (`auth.e2e-spec.ts`)                            | Not applicable             | Not applicable                                                                                            |

No route takes a user id or a review id for writing: owned rows are always selected with the
caller's id from the token in the `WHERE` clause.

Role checks: no route requires ADMIN yet (the admin routes come in P6). The global `RolesGuard`
is covered with test-only routes (`support/probe.controller.ts`): a USER gets 403 on an ADMIN
route and reaches it after a promotion followed by a refresh; without a token it answers 401.

### Public routes

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (they act on
credentials or the cookie, not on an access token), `GET /games`, `GET /games/:slug`,
`GET /games/:slug/reviews`, `GET /genres`, `GET /users/:username` (catalog, reviews and profiles
are readable by anyone), `GET /health/live`, `GET /health/ready`, and `GET /docs` with
`/docs/openapi.json` (off in production unless `ENABLE_DOCS=true`).
