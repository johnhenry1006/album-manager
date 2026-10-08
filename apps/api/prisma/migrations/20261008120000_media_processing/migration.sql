-- Accepted duplicates retain independent media identities and original bytes.
DROP INDEX "media_checksum_key";
CREATE INDEX "media_checksum_created_at_id_idx" ON "media" ("checksum", "created_at", "id");

-- Preserve legacy identities under 'default'; new renditions have explicit names.
ALTER TABLE "media_variants" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'default';
UPDATE "media_variants" SET "name" = CASE
    WHEN "type" = 'OPTIMIZED' THEN 'optimized'
    WHEN "type" = 'PREVIEW' THEN 'preview'
    WHEN "type" = 'BLUR_PLACEHOLDER' THEN 'placeholder'
    WHEN "type" = 'THUMBNAIL' AND GREATEST("width", "height") IN (800, 400, 200)
        THEN 'thumbnail-' || GREATEST("width", "height")::text
    ELSE 'default'
END;
DROP INDEX "media_variants_media_id_type_format_key";
CREATE UNIQUE INDEX "media_variants_media_id_type_format_name_key"
    ON "media_variants" ("media_id", "type", "format", "name");
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_name_check"
    CHECK ("name" ~ '^[a-z0-9][a-z0-9-]{0,63}$');

-- Durable checkpoint: retrying a previously admitted job must not revoke admission.
ALTER TABLE "upload_files" ADD COLUMN "processing_accepted_at" TIMESTAMPTZ(3);
