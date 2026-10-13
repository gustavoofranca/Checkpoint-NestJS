# Catalog query plans

Captured on 2026-10-09 for phase P3 (`docs/PLAN.md`). The SQL is exactly what Prisma sent for
`GET /api/v1/games` (taken from Prisma's query event), explained on the e2e test database:
the 211-game seed plus 5 test games, PostgreSQL 18.6.

Each query is shown with the plan PostgreSQL chose, and with sequential scans disabled to show
the index it can use. At about 200 rows a sequential scan is cheaper for the substring search;
the trigram index takes over as the table grows.

Every sort is served by a scan of its `(key, id)` index in sort order, with no sort step. On
pages after a cursor the redundant bound on the key becomes the `Index Cond`, so the scan
starts at the cursor instead of the beginning of the index (`docs/adr/0005`).

## newest: first page

```sql
SELECT … FROM "games" WHERE 1=1 ORDER BY "release_date"DESC NULLS FIRST, "id" DESC LIMIT $1 OFFSET $2
-- parameters: ["21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan Backward using games_release_date_id_idx on games
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan Backward using games_release_date_id_idx on games
```

## newest: page after a cursor

```sql
SELECT … FROM "games" WHERE ("release_date" <= $1 AND ("release_date" < $2 OR "id" < $3)) ORDER BY "release_date"DESC NULLS FIRST, "id" DESC LIMIT $4 OFFSET $5
-- parameters: ["2024-09-10T00:00:00.000Z","2024-09-10T00:00:00.000Z","01a1220c-97b5-774a-9736-db7b34fa27c2","21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan Backward using games_release_date_id_idx on games
         Index Cond: (release_date <= '2024-09-10'::date)
         Filter: ((release_date < '2024-09-10'::date) OR (id < '01a1220c-97b5-774a-9736-db7b34fa27c2'::uuid))
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan Backward using games_release_date_id_idx on games
         Index Cond: (release_date <= '2024-09-10'::date)
         Filter: ((release_date < '2024-09-10'::date) OR (id < '01a1220c-97b5-774a-9736-db7b34fa27c2'::uuid))
```

## top_rated: first page

```sql
SELECT … FROM "games" WHERE 1=1 ORDER BY "rating_average" DESC, "id" DESC LIMIT $1 OFFSET $2
-- parameters: ["21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan Backward using games_rating_average_id_idx on games
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan Backward using games_rating_average_id_idx on games
```

## top_rated: page after a cursor

```sql
SELECT … FROM "games" WHERE ("rating_average" <= $1 AND ("rating_average" < $2 OR "id" < $3)) ORDER BY "rating_average" DESC, "id" DESC LIMIT $4 OFFSET $5
-- parameters: ["4.50","4.50","01a1220c-933c-764d-b287-ea796e16c592","21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan Backward using games_rating_average_id_idx on games
         Index Cond: (rating_average <= 4.50)
         Filter: ((rating_average < 4.50) OR (id < '01a1220c-933c-764d-b287-ea796e16c592'::uuid))
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan Backward using games_rating_average_id_idx on games
         Index Cond: (rating_average <= 4.50)
         Filter: ((rating_average < 4.50) OR (id < '01a1220c-933c-764d-b287-ea796e16c592'::uuid))
```

## title: first page

```sql
SELECT … FROM "games" WHERE 1=1 ORDER BY "title_sort" ASC, "id" ASC LIMIT $1 OFFSET $2
-- parameters: ["21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan using games_title_sort_id_idx on games
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan using games_title_sort_id_idx on games
```

## title: page after a cursor

```sql
SELECT … FROM "games" WHERE ("title_sort" >= $1 AND ("title_sort" > $2 OR "id" > $3)) ORDER BY "title_sort" ASC, "id" ASC LIMIT $4 OFFSET $5
-- parameters: ["battlefield 2042","battlefield 2042","01a1220c-9bcd-77cf-8230-110ec2e4015e","21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Index Scan using games_title_sort_id_idx on games
         Index Cond: ((title_sort)::text >= 'battlefield 2042'::text)
         Filter: (((title_sort)::text > 'battlefield 2042'::text) OR (id > '01a1220c-9bcd-77cf-8230-110ec2e4015e'::uuid))
```

With sequential scans disabled:

```
 Limit
   ->  Index Scan using games_title_sort_id_idx on games
         Index Cond: ((title_sort)::text >= 'battlefield 2042'::text)
         Filter: (((title_sort)::text > 'battlefield 2042'::text) OR (id > '01a1220c-9bcd-77cf-8230-110ec2e4015e'::uuid))
```

## search q=witcher (newest)

```sql
SELECT … FROM "games" WHERE "title" ILIKE ('%' || $1 || '%') ORDER BY "release_date"DESC NULLS FIRST, "id" DESC LIMIT $2 OFFSET $3
-- parameters: ["witcher","21","0"]
```

Plan chosen by PostgreSQL:

```
 Limit
   ->  Sort
         Sort Key: release_date DESC, id DESC
         ->  Seq Scan on games
               Filter: ((title)::text ~~* '%witcher%'::text)
```

With sequential scans disabled:

```
 Limit
   ->  Sort
         Sort Key: release_date DESC, id DESC
         ->  Bitmap Heap Scan on games
               Recheck Cond: ((title)::text ~~* '%witcher%'::text)
               ->  Bitmap Index Scan on games_title_trgm_idx
                     Index Cond: ((title)::text ~~* '%witcher%'::text)
```
