import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';

// Opt-in: real PostgreSQL, transactional DDL, no application-table mutations.
// Direct SQL here verifies the migration's database guarantees independently of Prisma.
describe.skipIf(process.env.DATABASE_TESTS !== '1')('initial schema migration', () => {
    let client;
    let migration;

    beforeAll(async () => {
        migration = await readFile(
            new URL('../../../prisma/migrations/20261008040000_initial_album_manager/migration.sql', import.meta.url),
            'utf8',
        );
        const { databaseUrl } = validateDatabaseEnvironment(loadEnvironment());
        client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
        await client.connect();
    });

    beforeEach(async () => {
        const schema = `schema_test_${randomUUID().replaceAll('-', '')}`;
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query(migration);
    });

    afterEach(async () => {
        await client?.query('ROLLBACK');
    });

    afterAll(async () => {
        await client?.end();
    });

    async function rejects(sql, values, code) {
        await client.query('SAVEPOINT expected_failure');
        try {
            await expect(client.query(sql, values)).rejects.toMatchObject({ code });
        } finally {
            await client.query('ROLLBACK TO SAVEPOINT expected_failure');
        }
    }

    async function media() {
        const id = randomUUID();
        await client.query(
            `INSERT INTO media (id, type, original_filename, mime_type, extension, file_size, updated_at)
             VALUES ($1, 'IMAGE', 'photo.jpg', 'image/jpeg', 'jpg', 5000000000, now())`,
            [id],
        );
        return id;
    }

    async function album(cover = null) {
        const id = randomUUID();
        await client.query(
            'INSERT INTO albums (id, name, slug, cover_media_id, updated_at) VALUES ($1, $2, $4, $3, now())',
            [id, 'Album', cover, id],
        );
        return id;
    }

    async function session() {
        const id = randomUUID();
        await client.query('INSERT INTO upload_sessions (id) VALUES ($1)', [id]);
        return id;
    }

    it('allows a media item in multiple albums, with unique memberships and stable positions', async () => {
        const mediaId = await media();
        const first = await album();
        const second = await album();
        for (const albumId of [first, second]) {
            await client.query('INSERT INTO album_media (id, album_id, media_id, position) VALUES ($1, $2, $3, 0)', [
                randomUUID(),
                albumId,
                mediaId,
            ]);
        }
        expect((await client.query('SELECT album_id FROM album_media WHERE media_id = $1', [mediaId])).rowCount).toBe(
            2,
        );
        await rejects(
            'INSERT INTO album_media (id, album_id, media_id) VALUES ($1, $2, $3)',
            [randomUUID(), first, mediaId],
            '23505',
        );
        await rejects('UPDATE album_media SET position = -1 WHERE album_id = $1', [first], '23514');
        await client.query('DELETE FROM albums WHERE id = $1', [first]);
        expect((await client.query('SELECT id FROM media WHERE id = $1', [mediaId])).rowCount).toBe(1);
        expect((await client.query('SELECT id FROM album_media WHERE media_id = $1', [mediaId])).rowCount).toBe(1);
    });

    it('creates global favorites without users and rejects a second favorite for the same media', async () => {
        const mediaId = await media();
        await client.query('INSERT INTO favorites (id, media_id) VALUES ($1, $2)', [randomUUID(), mediaId]);
        await rejects('INSERT INTO favorites (id, media_id) VALUES ($1, $2)', [randomUUID(), mediaId], '23505');
        expect((await client.query('SELECT media_id, created_at FROM favorites')).rows[0].media_id).toBe(mediaId);
    });

    it('allows unknown checksums and measurements but reserves known checksums even after soft deletion', async () => {
        const first = await media();
        const second = await media();
        expect((await client.query('SELECT id FROM media WHERE checksum IS NULL')).rowCount).toBe(2);
        expect(
            (
                await client.query('SELECT width, height, aspect_ratio, checksum, file_size FROM media WHERE id = $1', [
                    first,
                ])
            ).rows[0],
        ).toEqual({ width: null, height: null, aspect_ratio: null, checksum: null, file_size: '5000000000' });
        await client.query('UPDATE media SET checksum = $1, deleted_at = now() WHERE id = $2', ['a'.repeat(64), first]);
        await rejects('UPDATE media SET checksum = $1 WHERE id = $2', ['a'.repeat(64), second], '23505');
        await rejects('UPDATE media SET checksum = $1 WHERE id = $2', ['invalid', second], '23514');
    });

    it('requires explicit variant cleanup before media deletion and clears optional references', async () => {
        const mediaId = await media();
        const albumId = await album(mediaId);
        const sessionId = await session();
        const variantId = randomUUID();
        await client.query(
            `INSERT INTO media_variants (id, media_id, type, format, file_size, storage_key)
                            VALUES ($1, $2, 'ORIGINAL', 'jpeg', 10, 'original/key')`,
            [variantId, mediaId],
        );
        await client.query(
            `INSERT INTO upload_files (id, upload_session_id, client_filename, mime_type, file_size, media_id, duplicate_of_media_id, updated_at)
                            VALUES ($1, $2, 'photo.jpg', 'image/jpeg', 10, $3, $3, now())`,
            [randomUUID(), sessionId, mediaId],
        );
        await client.query('INSERT INTO favorites (id, media_id) VALUES ($1, $2)', [randomUUID(), mediaId]);
        await rejects('DELETE FROM media WHERE id = $1', [mediaId], '23503');
        await rejects(
            `INSERT INTO media_variants (id, media_id, type, format, file_size, storage_key) VALUES ($1, $2, 'ORIGINAL', 'jpeg', 10, 'other/key')`,
            [randomUUID(), mediaId],
            '23505',
        );
        await rejects(
            `INSERT INTO media_variants (id, media_id, type, format, file_size, storage_key) VALUES ($1, $2, 'PREVIEW', 'jpeg', 10, 'original/key')`,
            [randomUUID(), mediaId],
            '23505',
        );
        await client.query('DELETE FROM media_variants WHERE id = $1', [variantId]);
        await client.query('DELETE FROM media WHERE id = $1', [mediaId]);
        expect(
            (await client.query('SELECT cover_media_id FROM albums WHERE id = $1', [albumId])).rows[0].cover_media_id,
        ).toBeNull();
        expect((await client.query('SELECT media_id, duplicate_of_media_id FROM upload_files')).rows[0]).toEqual({
            media_id: null,
            duplicate_of_media_id: null,
        });
        expect((await client.query('SELECT id FROM favorites')).rowCount).toBe(0);
    });

    it('supports category trees, rejects direct self-parenting, and restricts parent deletion', async () => {
        const parent = randomUUID();
        const child = randomUUID();
        await client.query(
            `INSERT INTO categories (id, name, slug, updated_at) VALUES ($1, 'Parent', 'parent', now())`,
            [parent],
        );
        await client.query(
            `INSERT INTO categories (id, name, slug, parent_id, updated_at) VALUES ($1, 'Child', 'child', $2, now())`,
            [child, parent],
        );
        expect((await client.query('SELECT id FROM categories WHERE parent_id = $1', [parent])).rows[0].id).toBe(child);
        await rejects('UPDATE categories SET parent_id = id WHERE id = $1', [parent], '23514');
        await rejects('DELETE FROM categories WHERE id = $1', [parent], '23503');
    });

    it('enforces taxonomy pairs and removes assignments without deleting media', async () => {
        const mediaId = await media();
        for (const [table, join, foreignKey] of [
            ['tags', 'media_tags', 'tag_id'],
            ['categories', 'media_categories', 'category_id'],
        ]) {
            const taxonomyId = randomUUID();
            await client.query(
                `INSERT INTO ${table} (id, name, slug, updated_at) VALUES ($1, 'Taxonomy', 'taxonomy', now())`,
                [taxonomyId],
            );
            await client.query(`INSERT INTO ${join} (id, media_id, ${foreignKey}) VALUES ($1, $2, $3)`, [
                randomUUID(),
                mediaId,
                taxonomyId,
            ]);
            await rejects(
                `INSERT INTO ${join} (id, media_id, ${foreignKey}) VALUES ($1, $2, $3)`,
                [randomUUID(), mediaId, taxonomyId],
                '23505',
            );
            await client.query(`DELETE FROM ${table} WHERE id = $1`, [taxonomyId]);
            expect((await client.query(`SELECT id FROM ${join}`)).rowCount).toBe(0);
        }
        expect((await client.query('SELECT id FROM media')).rowCount).toBe(1);
    });

    it('represents every upload file status and preserves files until explicit session cleanup', async () => {
        const sessionId = await session();
        const statuses = ['REGISTERED', 'UPLOADING', 'PROCESSING', 'DUPLICATE_PENDING', 'READY', 'FAILED', 'CANCELLED'];
        for (const status of statuses) {
            await client.query(
                `INSERT INTO upload_files (id, upload_session_id, client_filename, mime_type, file_size, status, updated_at)
                                VALUES ($1, $2, 'file.jpg', 'image/jpeg', 0, $3, now())`,
                [randomUUID(), sessionId, status],
            );
        }
        expect((await client.query('SELECT status FROM upload_files')).rows.map((row) => row.status).sort()).toEqual(
            [...statuses].sort(),
        );
        await rejects('DELETE FROM upload_sessions WHERE id = $1', [sessionId], '23503');
        await rejects(
            "UPDATE upload_sessions SET completed_at = created_at - interval '1 second' WHERE id = $1",
            [sessionId],
            '23514',
        );
    });

    it('stores optional one-to-one metadata and enforces coordinate ranges', async () => {
        const mediaId = await media();
        const id = randomUUID();
        await client.query(
            `INSERT INTO media_metadata (id, media_id, raw_metadata, updated_at) VALUES ($1, $2, $3, now())`,
            [id, mediaId, { camera: { source: 'EXIF' } }],
        );
        expect((await client.query('SELECT camera_make, raw_metadata FROM media_metadata')).rows[0]).toEqual({
            camera_make: null,
            raw_metadata: { camera: { source: 'EXIF' } },
        });
        await rejects(
            'INSERT INTO media_metadata (id, media_id, updated_at) VALUES ($1, $2, now())',
            [randomUUID(), mediaId],
            '23505',
        );
        await rejects('UPDATE media_metadata SET latitude = 91 WHERE id = $1', [id], '23514');
        await rejects('UPDATE media_metadata SET longitude = -181 WHERE id = $1', [id], '23514');
        await client.query('DELETE FROM media WHERE id = $1', [mediaId]);
        expect((await client.query('SELECT id FROM media_metadata')).rowCount).toBe(0);
    });

    it('persists global JSON settings under unique keys', async () => {
        await client.query(
            `INSERT INTO application_settings (id, key, value, updated_at) VALUES ($1, 'processing', $2, now())`,
            [randomUUID(), { quality: 85 }],
        );
        expect(
            (await client.query('SELECT value FROM application_settings WHERE key = $1', ['processing'])).rows[0].value,
        ).toEqual({ quality: 85 });
        await rejects(
            `INSERT INTO application_settings (id, key, value, updated_at) VALUES ($1, 'processing', '{}', now())`,
            [randomUUID()],
            '23505',
        );
    });

    it.each([
        'file_size = -1',
        'width = 0',
        'height = -1',
        'aspect_ratio = 0',
        "aspect_ratio = 'NaN'::double precision",
    ])('rejects invalid media measurements: %s', async (assignment) => {
        const id = await media();
        await rejects(`UPDATE media SET ${assignment} WHERE id = $1`, [id], '23514');
    });
});
