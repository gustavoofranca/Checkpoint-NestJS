# 0004. Short-lived JWT access tokens and rotating opaque refresh tokens in a cookie

- Status: accepted
- Date: 2026-10-09

## Context

The web app needs sessions that survive a page reload without keeping a long-lived credential
where scripts can read it. `docs/SECURITY.md` rules out tokens in URLs and in `localStorage`.

## Decision

- **Access token**: JWT, HS256, 15 minutes, claims `sub`, `role`, `iss`, `aud`, `iat`, `exp`.
  Returned in the response body and kept in memory by the web app. Verification pins the
  algorithm, issuer and audience (`src/modules/auth/auth.module.ts`) and validates the claims.
- **Refresh token**: 32 random bytes, base64url, opaque. Only its SHA-256 is stored. 30 days.
  Sent in a cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`.
- **Rotation**: each refresh revokes the presented token and issues its successor in the same
  family, in one transaction. The revocation is a conditional update
  (`WHERE revoked_at IS NULL AND expires_at > now()`); under PostgreSQL's READ COMMITTED a
  concurrent update of the same row waits and then re-checks the condition, so exactly one
  request can claim a token.
- **Reuse detection**: a token that cannot be claimed because it was already revoked means a
  copy is being replayed. The whole family is revoked, which ends both the legitimate and the
  stolen session.
- **CSRF**: `refresh` and `logout` act on the cookie alone, so besides `SameSite=Strict` they
  require an `Origin` header from the CORS allow-list.
- **Logout** revokes the family and clears the cookie; it answers 204 even without a session.

## Consequences

- A stolen access token is useful for at most 15 minutes; no server-side revocation list.
- A role change applies at the next refresh, within those 15 minutes.
- Two tabs refreshing with the same cookie at the same moment end the session (the loser counts
  as reuse). Accepted: the web app refreshes from one place, and the rule stays simple.
- Hashing the refresh token with SHA-256 (not Argon2) is enough: it is 256 bits of randomness,
  not a guessable password, and the lookup must be by hash.
- The refresh endpoint does not serve clients that send no `Origin`, such as curl. They are
  not its audience; they can sign in again.

## Alternatives considered

- **Long-lived JWT in `localStorage`**: readable by any script injected into the page, and not
  revocable before expiry.
- **Server-side sessions only**: simpler revocation, but every request needs a session lookup,
  and the API would not be stateless for the access path.
- **JWT refresh tokens**: rotation and reuse detection need server state anyway; an opaque
  random value is simpler and reveals nothing.
- **Allowing the first refresh to win and ignoring the second**: friendlier to racing tabs, but
  then a replayed token after rotation is indistinguishable from a race, and theft goes unseen.
