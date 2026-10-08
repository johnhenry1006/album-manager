ALTER TABLE "media" ADD COLUMN "purge_started_at" TIMESTAMPTZ(3);
ALTER TABLE "media" ADD CONSTRAINT "media_purge_requires_trash"
  CHECK ("purge_started_at" IS NULL OR "deleted_at" IS NOT NULL);
CREATE INDEX "media_deleted_at_id_idx" ON "media"("deleted_at", "id");
