# Known failure modes of AI-written code

Independent research keeps finding the same pattern: generated code runs and passes a quick
manual test, yet omits security controls nobody asked for explicitly. This file lists the
recurring mistakes and the guard this project uses against each. Treat it as a pre-commit
self-review: before ending a phase, go through the list and confirm none applies.

## Evidence

- Veracode's 2025 GenAI Code Security Report tested more than 100 models on 80 tasks and found
  that about 45% of samples introduced an OWASP Top 10 weakness, with cross-site scripting
  defences missing in the large majority of relevant samples. Newer models were not
  meaningfully safer. <https://www.veracode.com/blog/genai-code-security-report/>
- A Cloud Security Alliance research note (2026) reports that roughly one in five generated
  samples referenced a package that does not exist, which attackers exploit by registering
  those names ("slopsquatting").
  <https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/>
- Audit write-ups of AI-built applications list the same top findings again and again:
  secrets in source or in the client bundle, authentication enforced only in the UI, missing
  ownership checks, unvalidated input, verbose errors, open CORS and no rate limiting.
  <https://www.cleveroad.com/blog/vibe-coding-security-risks/>,
  <https://redwerk.com/blog/vibe-coding-security-risks/>,
  <https://itlackey.dev/blog/security-holes-in-vibe-coded-apps/>
- OWASP API Security Top 10 (2023): <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>

## Security mistakes

| Mistake | Guard in this project |
|---|---|
| Secret hardcoded "just for now", or a default like `JWT_SECRET \|\| 'secret'` | Env schema with no defaults for secrets; process exits if missing; gitleaks in CI |
| Auth checked in the front end only | Global guard on the server, deny by default |
| Endpoint authenticated but not authorized; any user can edit any row by id | Owner id from the token in the `where` clause; authorization test matrix |
| An authorization check silently lost during a later refactor | The matrix tests fail when a check disappears. Never delete one of them. |
| Request body spread straight into the ORM (mass assignment, e.g. a user sets `role`) | DTO allow-list plus field-by-field `data` objects |
| Whole database row returned, password hash included | Response DTOs and Prisma `select` |
| SQL built with string interpolation | Query builder or tagged `$queryRaw` only; the `Unsafe` variants are banned by lint rule |
| Weak or outdated crypto: MD5 or SHA for passwords, `Math.random()` for tokens, bcrypt with low cost | Argon2id; `crypto.randomBytes`; hashes of refresh tokens only |
| JWT verified without pinning the algorithm, or without expiry | Explicit `algorithms`, `issuer`, `audience`; short lifetime |
| Tokens in `localStorage` | Access token in memory, refresh token in an HttpOnly cookie |
| `cors({ origin: '*' })` or reflecting the origin with credentials | Allow-list from the environment |
| No rate limit on login | Redis-backed limiter, stricter on auth routes |
| Stack traces and ORM errors returned to the client | Global exception filter with Problem Details |
| Unbounded list endpoints and unbounded `limit` | Cursor pagination with a hard cap |
| User-supplied URL fetched by the server | Fixed outbound host only |
| HTML from a third party rendered as-is | Strip on ingest; render as text; no `dangerouslySetInnerHTML` |
| Debug routes, seed endpoints or Swagger left open in production | None exist as HTTP routes; Swagger gated by environment |
| Container running as root, database port published to the internet | Non-root user; internal network only in the production compose file |

## Dependency mistakes

| Mistake | Guard |
|---|---|
| Importing a package that does not exist or has a look-alike name | `npm view` before every install; check repository and download history |
| Using an API from an older major version, or one that never existed | Read current docs or the installed type definitions before use |
| Adding a library for something the platform already does (uuid, fetch, deep clone) | Prefer Node and framework built-ins; justify each new dependency in the phase report |
| Loose version ranges that make builds unreproducible | Exact versions and `npm ci` |
| Deprecated packages chosen because they dominate old tutorials | Check the deprecation notice and last publish date |

## Code quality mistakes

| Mistake | Guard |
|---|---|
| Tests that only assert the happy path, or assert what the code does rather than what it should do | Each feature has failure, boundary and unauthorized cases |
| Tests that mock the thing under test, so they can never fail | e2e tests run against real PostgreSQL and Redis; mocks only at external boundaries (Steam) |
| Making a failing test pass by loosening it, skipping it or catching the error | Forbidden; report instead |
| `try/catch` that swallows the error or logs and continues | Catch only what can be handled; otherwise let the filter handle it |
| `any`, `as` casts and non-null `!` to silence the compiler | Lint errors; narrow types properly |
| Fallback values that hide a broken state (`?? []`, `\|\| 'unknown'`) where the value must exist | Fail loudly on impossible states |
| Race conditions from read-then-write | Unique constraints, upserts and transactions |
| N+1 queries in list endpoints | One query with `select` of needed relations; assert query count in a test for the list endpoints |
| Missing indexes for the filters and sorts the API offers | Every filter and sort in the spec has an index; check with `EXPLAIN` |
| Money or ratings in floating point | Integer cents; `numeric` for averages |
| Dates in local time | UTC everywhere, ISO 8601 in the API |
| Duplicated logic instead of reusing what the codebase already has | Search the code before writing a helper |
| Over-engineering: abstractions, generics and config for cases that do not exist | Build what the spec asks; three similar lines beat a premature abstraction |
| Comments that narrate the code, banners, emoji, leftover `console.log` | Comments explain why, rarely; logger only |
| Claiming something works without running it | Every acceptance criterion is verified by a command whose output is reported |
| README describing features that do not exist | Documentation is written from the code at the end of each phase |
| Dead files, unused exports and sample code from scaffolding | Remove scaffolding leftovers in the phase that created them |

## Agent behaviour mistakes

- Running destructive database or Git commands to "fix" a problem. Stop and ask.
- Editing an applied migration instead of creating a new one
- Changing unrelated files while implementing a feature. Keep diffs scoped to the phase.
- Continuing after a failed command as if it had passed. Read the output.
- Filling a gap in the spec with an invented requirement. Ask.
