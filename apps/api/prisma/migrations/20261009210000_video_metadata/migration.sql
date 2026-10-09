-- Add video fields to the shared metadata table; existing image rows stay valid.
ALTER TABLE media_metadata
    ADD COLUMN duration DOUBLE PRECISION,
    ADD COLUMN video_codec TEXT,
    ADD COLUMN audio_codec TEXT,
    ADD COLUMN frame_rate DOUBLE PRECISION,
    ADD COLUMN bitrate DOUBLE PRECISION,
    ADD CONSTRAINT media_metadata_duration_valid CHECK (duration > 0 AND duration < 'Infinity'::double precision),
    ADD CONSTRAINT media_metadata_frame_rate_valid CHECK (frame_rate > 0 AND frame_rate < 'Infinity'::double precision),
    ADD CONSTRAINT media_metadata_bitrate_valid CHECK (bitrate > 0 AND bitrate < 'Infinity'::double precision);
