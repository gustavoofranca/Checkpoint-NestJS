-- The title sort key is already normalized by the application, so it must compare byte by byte.
-- Without an explicit collation the order would follow the database locale, which differs
-- between images (docs/adr/0005). Prisma's schema language cannot declare a column collation.
-- PostgreSQL rebuilds games_title_sort_id_idx with the new collation.
ALTER TABLE "games" ALTER COLUMN "title_sort" TYPE VARCHAR(200) COLLATE "C";
