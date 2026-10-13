# 0005. Keyset (cursor) pagination for every list

- Status: accepted
- Date: 2026-10-09

## Context

`docs/SPEC.md` asks for cursor pagination on every list, a 50-item cap and no total counts. The
catalog offers three sorts (`newest`, `top_rated`, `title`), a title search and a genre filter.

`OFFSET n` makes PostgreSQL read and discard `n` rows, so deep pages get slower, and rows inserted
or deleted between two requests shift the window: a client can see a game twice or never.

## Decision

- **Total order.** Each sort is a key plus the id as tie-breaker, backed by an index on
  `(key, id)`: `newest` is `release_date DESC NULLS FIRST, id DESC`, `top_rated` is
  `rating_average DESC, id DESC`, `title` is `title_sort ASC, id ASC`.
- **Cursor.** The response's `nextCursor` is base64url of `{ sort, <key>, id }` from the last item
  served. The next page asks for rows after that position:
  `key beyond k OR (key = k AND id beyond i)`, plus the redundant bound `key >= k` (or `<=`). Prisma
  cannot write a row comparison, and PostgreSQL cannot start an index scan from an OR; the bound
  gives it a starting point, which `docs/query-plans/catalog.md` shows as `Index Cond`.
- **Validation.** A cursor that does not decode, does not match the schema of its sort, or comes
  from another sort answers 400. Cursors are not signed: a forged one only picks another starting
  point within public data.
- **Page size.** `limit` from 1 to 50, default 20. The query fetches `limit + 1` rows; the extra
  row only says whether another page exists. No count query.
- **Games without a release date come first under `newest`.** That order is exactly a backward
  scan of the ascending `(release_date, id)` index, and announced games at the top of "newest" fit
  a catalog. Putting them last would need a `DESC NULLS LAST` index, which Prisma's schema cannot
  declare.
- **Title sort key.** `title_sort` holds the title lowercased, without accents or trademark signs,
  computed by the application (`src/common/text/title-sort-key.ts`), with the `"C"` collation so
  PostgreSQL compares it byte by byte. Sorting by `title` directly followed the database locale:
  the Alpine image compares bytes ("ARK" before "Age"), a Debian image would not.

## Consequences

- Every page costs the same, however deep, and concurrent writes cannot duplicate or skip rows
  that existed before them.
- No "page 7 of 30" and no jumping to an arbitrary page; the web app uses infinite scroll.
- Each new sort needs an index on `(key, id)` and a case in `src/modules/games/game-sort.ts`.
- The title search (`ILIKE '%q%'`, trigram index) is a filter, not a ranking; results follow the
  chosen sort.

## Alternatives considered

- **Offset pagination**: simplest for clients, but the cost and consistency problems above, and
  the spec rules it out.
- **Encoding only the id in the cursor and looking the row up again**: one more query per page,
  and a deleted row would break the cursor.
- **Signed cursors**: would only stop clients from crafting starting points they could reach by
  paging anyway.
