# 0008. Rate limits in Redis, failing closed on credential routes

- Status: accepted
- Date: 2026-10-13

## Context

`docs/SECURITY.md` section 4 asks for a global limit per IP and stricter limits on login,
register and refresh, keyed by IP and by account. Counters must be shared by every API process,
and the behaviour when Redis is unavailable has to be chosen.

## Decision

- `@nestjs/throttler` with a storage written for this project (`src/rate-limit`), so no third-party
  storage package. One Lua script per request increments the window counter, sets its expiry and
  marks a block atomically.
- Three limiters:

  | Name | Applies to | Key | Limit |
  |---|---|---|---|
  | `default` | every route | client IP | 300 per minute |
  | `auth-ip` | login, register, refresh | client IP | 30 per 15 minutes, then blocked 15 minutes |
  | `auth-account` | login, register | email in the body, normalized | 5 per 15 minutes, then blocked 15 minutes |

- Credential routes opt in with `@AuthRateLimit()`. The per-account limiter means spreading
  guesses for one account over many IPs does not help.
- A blocked request gets 429 Problem Details and the standard `Retry-After` header in seconds.
  `@nestjs/throttler` would send `Retry-After-auth-account` for named limiters, which clients
  ignore, so the guard sets the header itself.
- The client IP is `request.ip`. `TRUST_PROXY_HOPS` sets how many proxies are trusted to report
  it; the default 0 ignores `X-Forwarded-For`, so a client cannot pick a new IP per request.
- When Redis is unreachable:
  - `auth-ip` and `auth-account` fail closed: the request gets 503. A limiter that cannot count
    must not let password guessing through.
  - `default` fails open with a warning, so the public catalog keeps working on PostgreSQL.

## Consequences

- During a Redis outage nobody can sign in, register or refresh; reads and existing access tokens
  keep working until they expire. `/health/ready` reports Redis down at the same time.
- An attacker can lock a specific account out of login for 15 minutes by failing five times.
  Accepted for this project; a larger service would add a CAPTCHA or e-mail unlock instead of a
  plain block.
- Users behind one NAT share the IP limits; 30 credential requests per 15 minutes leaves room for
  a household or an office.
- Tests run against Redis database 1, emptied before every e2e test.

## Alternatives considered

- **In-memory storage**: each process would count on its own, and a restart resets every limit.
- **`@nest-lab/throttler-storage-redis`**: works, but a third-party package for about forty lines
  of code, and it does not choose a failure mode per limiter.
- **Failing open everywhere**: keeps login available during an outage, at the cost of an
  unlimited password-guessing window exactly when monitoring is likely to be degraded.
- **Counting only failed logins**: closer to the threat, but it needs the limiter after the
  password check, which costs an Argon2 run per attempt under attack.
