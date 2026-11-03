# Security policy

## Reporting a vulnerability

Report it privately through GitHub:
[Report a vulnerability](https://github.com/gustavoofranca/Checkpoint-NestJS/security/advisories/new)
on the repository's Security tab. Please do not open a public issue or pull request for it.

Include what you found, the affected route or file, the steps to reproduce it and the impact you
expect. You will get an acknowledgement within seven days. Once a fix is merged, the advisory is
published with credit to you, unless you prefer otherwise.

## Supported versions

Only the latest release, and the `main` branch, receive fixes.

## Scope

In scope: the code in this repository (the API, the worker, the web app, the Dockerfiles and the
Compose files).

Out of scope: Steam and its store API, the third-party packages themselves (report those to
their maintainers; Dependabot keeps this repository's versions current), and findings that need
a deployment configured against `docs/SECURITY.md` and the comments in
`docker-compose.prod.yml`.

The security rules the code follows are in [docs/SECURITY.md](docs/SECURITY.md), and how each is
enforced and tested is in [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md).
