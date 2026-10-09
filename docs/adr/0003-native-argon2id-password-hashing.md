# 0003. Password hashing with Node's built-in Argon2id

- Status: accepted
- Date: 2026-10-09

## Context

`docs/SECURITY.md` requires Argon2id at or above OWASP guidance. Until recently Node.js had no
Argon2, so projects used `argon2` (a native addon compiled at install time) or `@node-rs/argon2`
(prebuilt binaries). Node.js added `crypto.argon2()` in v24.7.0, without an experimental marker.

## Decision

Hash passwords with `crypto.argon2('argon2id', ...)` in `src/modules/users/password-hasher.ts`,
with the OWASP Password Storage Cheat Sheet minimum (checked 2026-10-09): 19 MiB of memory,
2 passes, 1 lane, a 16-byte random salt and a 32-byte tag. Store the result as a PHC string
(`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`), the format other Argon2 libraries read and
write, and verify with the parameters stored in each hash and `crypto.timingSafeEqual`.

`password-hasher.spec.ts` checks the native function against the Argon2id test vector of
RFC 9106 section 5.3, then the wrapper: round trip, wrong password, distinct salts, hashes made
with other parameters, and malformed input.

## Consequences

- No native addon or prebuilt binary to install, audit or rebuild per platform
- The project needs Node.js 24.7 or later (`engines` in `api/package.json`)
- The PHC encoding is our code, about twenty lines, covered by tests. Raising the parameters
  later only changes the constants: existing hashes still verify with the values they carry.

## Alternatives considered

- `argon2` package: mature, but a compiled addon with an install script, which npm 11 blocks
  by default
- `@node-rs/argon2`: prebuilt binaries per platform; another supply-chain surface for something
  the runtime now provides
- scrypt from `node:crypto`: built in for longer, but OWASP lists it as the fallback when
  Argon2id is not available
