# 0006. Denormalized rating columns, recomputed under a row lock

- Status: accepted
- Date: 2026-10-09

## Context

Every game card and the `top_rated` sort show a game's average rating and number of reviews.
Computing `avg(rating)` and `count(*)` over `reviews` on each catalog read would turn the most
frequent query into an aggregate join, and the `top_rated` sort could not use an index.

## Decision

- `games.rating_average` (`numeric(3,2)`) and `games.rating_count` are stored, and indexed with the
  id for the sort (`docs/adr/0005`).
- Every review write runs in one transaction that:
  1. locks the game row with `SELECT … FOR UPDATE` (`src/modules/reviews/reviews.service.ts`),
  2. creates, replaces or deletes the review,
  3. recomputes both columns from the game's reviews with `avg` and `count`, rounded to two
     decimals, and writes them.
- The values are recomputed, not adjusted by deltas, so a write can never drift from the
  reviews; the lock makes concurrent writes to one game run one after another.
- CHECK constraints keep the columns in range: average between 0 and 5, count not negative, and
  an average of 0 whenever the count is 0.

## Consequences

- Catalog reads get both numbers from the game row, and `top_rated` is an index scan.
- Review writes to the same game are serialized. Writes to different games do not wait for each
  other. At this project's scale the cost is a few milliseconds per review write.
- Without the lock the result is wrong under concurrency: two transactions can each compute the
  average before the other commits, and the last one to write wins with a stale value.
  `test/reviews.e2e-spec.ts` sends 20 reviews of one game at once; with the lock removed it failed
  in 5 runs out of 5, with it in place it passed every time.
- Any other path that writes reviews (none today; a future import, for instance) must go through
  the same service or recompute the same way.

## Alternatives considered

- **Aggregate on read**: always exact, but every catalog page becomes an aggregate query and the
  rating sort cannot use an index.
- **Delta updates** (`rating_count + 1`, running sum): cheaper, but the average of a replaced or
  deleted review needs the old value, and any missed update leaves a permanent error.
- **Serializable isolation instead of a row lock**: also correct, but conflicting transactions
  fail and must be retried by the application; the lock just waits.
- **Database trigger**: keeps the logic next to the data, but hides it from the application code
  and its tests.
