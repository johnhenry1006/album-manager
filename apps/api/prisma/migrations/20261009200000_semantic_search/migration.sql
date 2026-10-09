CREATE TABLE semantic_indexes (
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE ON UPDATE CASCADE,
    space VARCHAR(128) NOT NULL,
    model VARCHAR(128) NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions BETWEEN 1 AND 4096),
    source_checksum VARCHAR(64) NOT NULL,
    vector DOUBLE PRECISION[] NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    tag_revision VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('READY', 'FAILED')),
    error_code VARCHAR(64),
    updated_at TIMESTAMPTZ(3) NOT NULL,
    PRIMARY KEY (media_id, space),
    CONSTRAINT semantic_vector_dimensions CHECK (
        (status = 'READY' AND cardinality(vector) = dimensions) OR
        (status = 'FAILED' AND cardinality(vector) = 0)
    ),
    CONSTRAINT semantic_tags_array CHECK (jsonb_typeof(tags) = 'array')
);
CREATE INDEX semantic_indexes_profile_status_idx ON semantic_indexes(space, model, dimensions, status);
CREATE INDEX semantic_indexes_status_updated_at_idx ON semantic_indexes(status, updated_at);
