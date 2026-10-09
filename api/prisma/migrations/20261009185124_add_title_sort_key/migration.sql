-- Title sort key (docs/adr/0005). Added in three steps so the migration also runs on a database
-- that already holds games.
ALTER TABLE "games" ADD COLUMN "title_sort" VARCHAR(200);

-- Backfill: lower() approximates the application's key, which also strips accents and
-- trademark signs. The next seed or sync writes the exact value.
UPDATE "games" SET "title_sort" = lower("title");

ALTER TABLE "games" ALTER COLUMN "title_sort" SET NOT NULL;

-- The title sort now reads this column; the old index on title is no longer used.
DROP INDEX "games_title_id_idx";

CREATE INDEX "games_title_sort_id_idx" ON "games"("title_sort", "id");
