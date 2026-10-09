CREATE TABLE users (
 id UUID PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE auth_sessions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 token_hash VARCHAR(64) NOT NULL UNIQUE, csrf_token VARCHAR(43) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_at_id_idx ON auth_sessions(expires_at, id);
INSERT INTO users (id, email, updated_at) VALUES ('00000000-0000-4000-8000-000000000001', 'legacy-owner@invalid.local', CURRENT_TIMESTAMP);
ALTER TABLE favorites ADD COLUMN user_id UUID;
UPDATE favorites SET user_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE favorites ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX favorites_media_id_key;
DROP INDEX favorites_created_at_id_idx;
CREATE UNIQUE INDEX favorites_user_id_media_id_key ON favorites(user_id, media_id);
CREATE INDEX favorites_user_id_created_at_id_idx ON favorites(user_id, created_at, id);
CREATE INDEX favorites_media_id_idx ON favorites(media_id);
