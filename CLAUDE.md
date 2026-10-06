# CLAUDE.md

Checkpoint is a game catalog API (NestJS, Prisma, PostgreSQL, Redis) with a small web UI.
It is a public portfolio project. A recruiter and a senior back-end engineer will read this
code. Correctness, security and clarity matter more than feature count.

## Read these first, in order

1. `docs/SPEC.md` — what to build, and what not to build
2. `docs/ARCHITECTURE.md` — structure and technical decisions
3. `docs/SECURITY.md` — binding security rules
4. `docs/AI-PITFALLS.md` — known failure modes of AI-written code and the guard for each
5. `docs/CONVENTIONS.md` — code style, tests, Git
6. `docs/PLAN.md` — phases and acceptance criteria
7. `docs/PROGRESS.md` — what has been done so far
8. `docs/DESIGN.md` and `docs/DOCUMENTATION.md` — only when a phase needs them

## Non-negotiable rules

1. **One phase at a time.** Implement only the current phase from `docs/PLAN.md`. Do not start
   the next one. Do not add features that are not in `docs/SPEC.md`; propose them instead.
2. **Plan before code.** Present a plan for the phase and wait for approval.
3. **Never guess an API or a package.** Before adding a dependency, confirm it exists and is
   maintained with `npm view <name> version time.modified repository.url`. Before using a
   library API you are not certain about, read its current documentation or its type
   definitions in `node_modules`. If you cannot verify something, say so; do not invent it.
4. **Pin exact dependency versions** (no `^` or `~`) and commit the lockfile. Use the latest
   stable release of each dependency at the time of installation and record the versions in
   `docs/PROGRESS.md`.
5. **Secrets never enter the repository.** No real secret in code, tests, docs, commits or
   logs. Only `.env.example` with placeholder values is committed. Do not read `.env`.
6. **Never weaken a check to make it pass.** No deleting or skipping tests, no
   `eslint-disable`, no `@ts-ignore`, no `as any`, no lowering coverage thresholds. If a check
   fails, fix the cause or stop and report.
7. **No placeholders.** No `TODO`, no stubbed functions, no mock data in production code paths,
   no commented-out code. If something cannot be finished, stop and report it.
8. **Every protected route has an authorization test.** See the matrix in `docs/SECURITY.md`.
9. **No destructive commands** without explicit confirmation: `prisma migrate reset`,
   `DROP`, `rm -rf`, force pushes, history rewrites. Never push.
10. **Ask when the spec is ambiguous.** A short question beats a wrong assumption.

## Definition of done for any phase

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass in every package touched
- New behaviour has tests, including the failure and unauthorized paths
- The acceptance criteria of the phase in `docs/PLAN.md` are met and checked one by one
- `docs/PROGRESS.md` is updated
- Commits are small and follow Conventional Commits

## End-of-phase report

Stop and report, in this shape:

- What was built (files and modules)
- Decisions made that the spec did not dictate, with the reason
- How each acceptance criterion was verified (command and result)
- Anything you could not verify, and known limitations
- Dependencies added, with versions
