-- Supports deterministic filename pagination in either direction.
CREATE INDEX "media_deleted_at_original_filename_id_idx"
    ON "media" ("deleted_at", "original_filename", "id");

-- A reverse scan of the existing ASC taken_at index would put nulls first.
CREATE INDEX "media_active_taken_at_desc_id_idx"
    ON "media" ("taken_at" DESC NULLS LAST, "id" DESC)
    WHERE "deleted_at" IS NULL;
