# Documentation standard

A visitor decides in about thirty seconds whether to keep reading. The README must let them
understand what this is, see that it runs, and find the interesting engineering quickly.

## Tone

Plain, specific and factual. Write what exists. No superlatives ("blazing fast", "robust",
"enterprise-grade"), no emoji, no badge walls, no feature that is not implemented. Numbers
come from a command the reader can run.

## README.md structure

1. **Title and one-sentence description**
2. **Badges**, at most four: CI status, coverage, license, Node version
3. **Screenshot** of the catalog screen, and the live demo link if deployed
4. **What it does**, five or six bullets
5. **Architecture**: one Mermaid diagram (client, API, worker, PostgreSQL, Redis, Steam) and a
   short paragraph. Link to `docs/ARCHITECTURE.md`.
6. **Quick start**: clone, `cp .env.example .env`, `docker compose up`, migrate and seed,
   open the URLs. It must work on a clean machine with only Docker installed. Test it.
7. **API overview**: table of endpoints, link to Swagger, two `curl` examples (list games,
   authenticated review)
8. **Engineering notes**: short sections with links into the code for the parts worth
   reading: authentication and refresh rotation, cursor pagination, cache invalidation,
   catalog sync, authorization test matrix
9. **Testing**: how to run, what is covered, current coverage number
10. **Performance**: the load test command and its measured result
11. **Security**: summary and link to `docs/SECURITY.md` and `docs/SECURITY-REVIEW.md`
12. **Decisions**: list of ADRs with one line each
13. **How this was built**: two or three sentences stating that the project was built with
    Claude Code under the rules in `CLAUDE.md` and `docs/`, with each phase reviewed by the
    author
14. **Limitations and next steps**: honest and short
15. **License**: MIT. A line stating the project is not affiliated with Valve or Steam.

## Other documents the agent produces

- `docs/adr/NNNN-title.md`: context, decision, consequences, alternatives considered. Half a
  page each.
- `docs/SECURITY-REVIEW.md`: output of phase P8, rule by rule, with the enforcing file and
  the proving test
- `SECURITY.md` at the root: how to report a vulnerability
- `api/test/README.md`: how the tests are organised and the authorization matrix
- `.env.example`: every variable, a fake value, and a comment
- `CHANGELOG.md`: one entry per phase

## OpenAPI

- Every route has a summary, tagged group, documented request DTO, and every response status
  it can return, including the Problem Details errors
- Auth schemes are declared so "Authorize" works in Swagger UI
- The generated `openapi.json` is committed, and CI fails if it is out of date

## Repository presentation

- Description and topics set on GitHub: `nestjs`, `prisma`, `postgresql`, `redis`, `bullmq`,
  `typescript`, `vitest`
- A clean history of small conventional commits across phases
- No leftover scaffolding files, no empty folders
