-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "album_visibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "media_variant_type" AS ENUM ('ORIGINAL', 'OPTIMIZED', 'PREVIEW', 'THUMBNAIL', 'BLUR_PLACEHOLDER');

-- CreateEnum
CREATE TYPE "upload_session_status" AS ENUM ('REGISTERED', 'UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "upload_file_status" AS ENUM ('REGISTERED', 'UPLOADING', 'PROCESSING', 'DUPLICATE_PENDING', 'READY', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "albums" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" UUID,
    "visibility" "album_visibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "type" "media_type" NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "aspect_ratio" DOUBLE PRECISION,
    "checksum" VARCHAR(64),
    "status" "media_status" NOT NULL DEFAULT 'PENDING',
    "taken_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "type" "media_variant_type" NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "quality" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_media" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_categories" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_tags" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "status" "upload_session_status" NOT NULL DEFAULT 'REGISTERED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_files" (
    "id" UUID NOT NULL,
    "upload_session_id" UUID NOT NULL,
    "client_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "status" "upload_file_status" NOT NULL DEFAULT 'REGISTERED',
    "storage_key" TEXT,
    "media_id" UUID,
    "duplicate_of_media_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "upload_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_metadata" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "camera_make" TEXT,
    "camera_model" TEXT,
    "lens" TEXT,
    "focal_length" DOUBLE PRECISION,
    "aperture" DOUBLE PRECISION,
    "iso" INTEGER,
    "shutter_speed" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "raw_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "albums_slug_key" ON "albums"("slug");

-- CreateIndex
CREATE INDEX "albums_cover_media_id_idx" ON "albums"("cover_media_id");

-- CreateIndex
CREATE INDEX "albums_deleted_at_created_at_id_idx" ON "albums"("deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "albums_deleted_at_visibility_created_at_id_idx" ON "albums"("deleted_at", "visibility", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_checksum_key" ON "media"("checksum");

-- CreateIndex
CREATE INDEX "media_deleted_at_created_at_id_idx" ON "media"("deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "media_deleted_at_taken_at_id_idx" ON "media"("deleted_at", "taken_at", "id");

-- CreateIndex
CREATE INDEX "media_deleted_at_status_created_at_id_idx" ON "media"("deleted_at", "status", "created_at", "id");

-- CreateIndex
CREATE INDEX "media_deleted_at_type_created_at_id_idx" ON "media"("deleted_at", "type", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_storage_key_key" ON "media_variants"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_media_id_type_format_key" ON "media_variants"("media_id", "type", "format");

-- CreateIndex
CREATE INDEX "album_media_album_id_position_id_idx" ON "album_media"("album_id", "position", "id");

-- CreateIndex
CREATE INDEX "album_media_album_id_created_at_id_idx" ON "album_media"("album_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "album_media_media_id_album_id_idx" ON "album_media"("media_id", "album_id");

-- CreateIndex
CREATE UNIQUE INDEX "album_media_album_id_media_id_key" ON "album_media"("album_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_name_id_idx" ON "categories"("parent_id", "name", "id");

-- CreateIndex
CREATE INDEX "categories_created_at_id_idx" ON "categories"("created_at", "id");

-- CreateIndex
CREATE INDEX "media_categories_category_id_media_id_idx" ON "media_categories"("category_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_categories_media_id_category_id_key" ON "media_categories"("media_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "tags_created_at_id_idx" ON "tags"("created_at", "id");

-- CreateIndex
CREATE INDEX "media_tags_tag_id_media_id_idx" ON "media_tags"("tag_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_tags_media_id_tag_id_key" ON "media_tags"("media_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_media_id_key" ON "favorites"("media_id");

-- CreateIndex
CREATE INDEX "favorites_created_at_id_idx" ON "favorites"("created_at", "id");

-- CreateIndex
CREATE INDEX "upload_sessions_status_created_at_id_idx" ON "upload_sessions"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "upload_sessions_created_at_id_idx" ON "upload_sessions"("created_at", "id");

-- CreateIndex
CREATE INDEX "upload_files_upload_session_id_status_created_at_id_idx" ON "upload_files"("upload_session_id", "status", "created_at", "id");

-- CreateIndex
CREATE INDEX "upload_files_status_created_at_id_idx" ON "upload_files"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "upload_files_created_at_id_idx" ON "upload_files"("created_at", "id");

-- CreateIndex
CREATE INDEX "upload_files_media_id_idx" ON "upload_files"("media_id");

-- CreateIndex
CREATE INDEX "upload_files_duplicate_of_media_id_idx" ON "upload_files"("duplicate_of_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_metadata_media_id_key" ON "media_metadata"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_settings_key_key" ON "application_settings"("key");

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media" ADD CONSTRAINT "album_media_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media" ADD CONSTRAINT "album_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_categories" ADD CONSTRAINT "media_categories_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_categories" ADD CONSTRAINT "media_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_upload_session_id_fkey" FOREIGN KEY ("upload_session_id") REFERENCES "upload_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_duplicate_of_media_id_fkey" FOREIGN KEY ("duplicate_of_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_metadata" ADD CONSTRAINT "media_metadata_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain bounds not expressible in the Prisma schema. Nullable measurements
-- remain valid before processing; storage sizes are bytes, including zero.
ALTER TABLE "media"
    ADD CONSTRAINT "media_file_size_check" CHECK ("file_size" >= 0),
    ADD CONSTRAINT "media_width_check" CHECK ("width" > 0),
    ADD CONSTRAINT "media_height_check" CHECK ("height" > 0),
    ADD CONSTRAINT "media_aspect_ratio_check" CHECK ("aspect_ratio" > 0 AND "aspect_ratio" < 'Infinity'::double precision),
    ADD CONSTRAINT "media_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$');

ALTER TABLE "media_variants"
    ADD CONSTRAINT "media_variants_file_size_check" CHECK ("file_size" >= 0),
    ADD CONSTRAINT "media_variants_width_check" CHECK ("width" > 0),
    ADD CONSTRAINT "media_variants_height_check" CHECK ("height" > 0),
    ADD CONSTRAINT "media_variants_quality_check" CHECK ("quality" BETWEEN 1 AND 100);

ALTER TABLE "album_media"
    ADD CONSTRAINT "album_media_position_check" CHECK ("position" >= 0);

ALTER TABLE "categories"
    ADD CONSTRAINT "categories_not_own_parent_check" CHECK ("parent_id" <> "id");

ALTER TABLE "upload_files"
    ADD CONSTRAINT "upload_files_file_size_check" CHECK ("file_size" >= 0);

ALTER TABLE "upload_sessions"
    ADD CONSTRAINT "upload_sessions_completed_at_check" CHECK ("completed_at" >= "created_at");

ALTER TABLE "media_metadata"
    ADD CONSTRAINT "media_metadata_focal_length_check" CHECK ("focal_length" > 0 AND "focal_length" < 'Infinity'::double precision),
    ADD CONSTRAINT "media_metadata_aperture_check" CHECK ("aperture" > 0 AND "aperture" < 'Infinity'::double precision),
    ADD CONSTRAINT "media_metadata_iso_check" CHECK ("iso" > 0),
    ADD CONSTRAINT "media_metadata_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "media_metadata_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
