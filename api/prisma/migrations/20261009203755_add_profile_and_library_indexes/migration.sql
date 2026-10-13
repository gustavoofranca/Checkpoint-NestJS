-- Indexes for the P4 reads: a user's library, newest change first and paginated by
-- (updated_at, game_id), and the latest reviews shown on a public profile.

-- CreateIndex
CREATE INDEX "library_entries_user_id_updated_at_game_id_idx" ON "library_entries"("user_id", "updated_at", "game_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_created_at_idx" ON "reviews"("user_id", "created_at");
