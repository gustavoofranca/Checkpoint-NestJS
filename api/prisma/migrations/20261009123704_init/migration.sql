-- pg_trgm backs the trigram index on games.title used by title search. It must exist before
-- that index is created. It is a trusted extension, so the migration role needs no superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "library_status" AS ENUM ('BACKLOG', 'PLAYING', 'COMPLETED', 'DROPPED');

-- CreateEnum
CREATE TYPE "sync_trigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "username" VARCHAR(24) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "steam_app_id" INTEGER NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "short_description" VARCHAR(1000) NOT NULL,
    "header_image_url" VARCHAR(500) NOT NULL,
    "release_date" DATE,
    "developers" TEXT[],
    "publishers" TEXT[],
    "is_free" BOOLEAN NOT NULL,
    "price_cents" INTEGER,
    "currency" CHAR(3),
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_genres" (
    "game_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_genres_pkey" PRIMARY KEY ("game_id","genre_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_entries" (
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "status" "library_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_entries_pkey" PRIMARY KEY ("user_id","game_id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "trigger" "sync_trigger" NOT NULL,
    "status" "sync_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "games_processed" INTEGER NOT NULL DEFAULT 0,
    "games_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_steam_app_id_key" ON "games"("steam_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_title_trgm_idx" ON "games" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "games_release_date_id_idx" ON "games"("release_date", "id");

-- CreateIndex
CREATE INDEX "games_rating_average_id_idx" ON "games"("rating_average", "id");

-- CreateIndex
CREATE INDEX "games_title_id_idx" ON "games"("title", "id");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "game_genres_genre_id_idx" ON "game_genres"("genre_id");

-- CreateIndex
CREATE INDEX "reviews_game_id_created_at_idx" ON "reviews"("game_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_game_id_key" ON "reviews"("user_id", "game_id");

-- CreateIndex
CREATE INDEX "library_entries_game_id_idx" ON "library_entries"("game_id");

-- CreateIndex
CREATE INDEX "sync_runs_started_at_idx" ON "sync_runs"("started_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data rules that Prisma's schema language cannot express. They live in the database so that no
-- write path, including raw SQL and future scripts, can bypass them (docs/SECURITY.md section 9).
-- Patterns avoid nested quantifiers.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "users_username_format_check" CHECK ("username" ~ '^[a-z0-9_]{3,24}$');

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

-- Prisma creates scalar list columns as nullable; an empty array means "none".
ALTER TABLE "games"
  ADD CONSTRAINT "games_slug_format_check"
    CHECK ("slug" ~ '^[a-z0-9-]+$' AND "slug" !~ '(^-|-$|--)'),
  ADD CONSTRAINT "games_developers_check"
    CHECK ("developers" IS NOT NULL AND array_position("developers", NULL) IS NULL),
  ADD CONSTRAINT "games_publishers_check"
    CHECK ("publishers" IS NOT NULL AND array_position("publishers", NULL) IS NULL),
  ADD CONSTRAINT "games_price_cents_check" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "games_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "games_price_currency_pair_check"
    CHECK (("price_cents" IS NULL) = ("currency" IS NULL)),
  ADD CONSTRAINT "games_rating_average_check" CHECK ("rating_average" BETWEEN 0 AND 5),
  ADD CONSTRAINT "games_rating_count_check" CHECK ("rating_count" >= 0),
  ADD CONSTRAINT "games_unrated_average_check" CHECK ("rating_count" > 0 OR "rating_average" = 0);

ALTER TABLE "genres"
  ADD CONSTRAINT "genres_slug_format_check"
    CHECK ("slug" ~ '^[a-z0-9-]+$' AND "slug" !~ '(^-|-$|--)');

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "reviews_body_length_check" CHECK (char_length("body") BETWEEN 10 AND 2000);

ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_counts_check" CHECK ("games_processed" >= 0 AND "games_failed" >= 0),
  ADD CONSTRAINT "sync_runs_finished_after_start_check"
    CHECK ("finished_at" IS NULL OR "finished_at" >= "started_at");
