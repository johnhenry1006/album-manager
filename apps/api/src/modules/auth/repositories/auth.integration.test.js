import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateAuthEnvironment } from '#config/auth.js';
import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { readTestMigrations } from '#infrastructure/database/isolatedDatabase.testUtils.js';
import { createIsolatedTestDatabase } from '#infrastructure/database/isolatedDatabase.testUtils.js';
import { createAlbumModule } from '#modules/albums/index.js';
import {
    createMediaDetailModule,
    createMediaFavoriteModule,
    createMediaListModule,
    createMediaTrashModule,
} from '#modules/media/index.js';

import { createAuthModule } from '../index.js';
import { LEGACY_OWNER_ID } from './auth.repository.js';

describe.skipIf(process.env.DATABASE_TESTS !== '1')('authentication and personal favorites in PostgreSQL', () => {
    const database = createIsolatedTestDatabase();
    beforeAll(() => database.open());
    afterAll(() => database.close());
    it('provisions the legacy owner, persists expiry/revocation, and isolates favorites across galleries', async () => {
        await database.withClient(async (client) => {
            const auth = createAuthModule({ client, config: validateAuthEnvironment({}) }).service;
            const a = await auth.provision({ email: 'owner@example.com', password: 'owner long password' });
            expect(a.id).toBe(LEGACY_OWNER_ID);
            const b = await auth.provision({ email: 'member@example.com', password: 'member long password' });
            const login = await auth.login({ email: a.email, password: 'owner long password' });
            expect((await auth.authenticate(login.token)).user).toEqual(a);
            await auth.logout(login.token);
            await expect(auth.authenticate(login.token)).rejects.toMatchObject({ statusCode: 401 });
            await database.rollback(async (tx) => {
                const media = await tx.media.create({
                    data: {
                        type: 'IMAGE',
                        status: 'READY',
                        originalFilename: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        extension: 'jpg',
                        fileSize: 10n,
                    },
                });
                const album = await tx.album.create({ data: { name: 'Shared', slug: 'shared' } });
                await tx.albumMedia.create({ data: { albumId: album.id, mediaId: media.id } });
                const favorites = createMediaFavoriteModule({ client: tx }).service;
                await favorites.add(media.id, {}, undefined, a);
                await favorites.add(media.id, {}, undefined, b);
                const first = await tx.favorite.findUnique({
                    where: { userId_mediaId: { userId: b.id, mediaId: media.id } },
                });
                await favorites.add(media.id, {}, undefined, b);
                await favorites.remove(media.id, {}, undefined, a);
                expect(
                    await tx.favorite.findUnique({ where: { userId_mediaId: { userId: b.id, mediaId: media.id } } }),
                ).toEqual(first);
                const config = {
                    maxLimit: 200,
                    urlExpirySeconds: 900,
                    displayUrlExpirySeconds: 900,
                    originalUrlExpirySeconds: 900,
                };
                const list = createMediaListModule({ client: tx, storage: {}, config }).service;
                expect((await list.list({ favorite: 'true' }, a)).items).toEqual([]);
                expect((await list.list({ favorite: 'false' }, a)).items).toMatchObject([
                    { id: media.id, favorite: false },
                ]);
                expect((await list.list({ favorite: 'true' }, b)).items).toMatchObject([
                    { id: media.id, favorite: true },
                ]);
                const detail = createMediaDetailModule({ client: tx, storage: {}, config }).service;
                expect((await detail.detail(media.id, {}, a)).favorite).toBe(false);
                expect((await detail.detail(media.id, {}, b)).favorite).toBe(true);
                const albums = createAlbumModule({ client: tx, storage: {}, config }).service;
                expect((await albums.listMedia(album.id, { favorite: 'true' }, a)).items).toEqual([]);
                expect((await albums.listMedia(album.id, { favorite: 'true' }, b)).items).toMatchObject([
                    { id: media.id, favorite: true },
                ]);
                await tx.media.update({ where: { id: media.id }, data: { deletedAt: new Date() } });
                const trash = createMediaTrashModule({ client: tx, storage: {}, config }).service;
                expect((await trash.list({}, a)).items[0].favorite).toBe(false);
                expect((await trash.list({}, b)).items[0].favorite).toBe(true);
            });
        });
    });
    it('serializes concurrent account provisioning without overwriting passwords', async () => {
        await database.withClient(async (client) => {
            const service = createAuthModule({ client, config: validateAuthEnvironment({}) }).service;
            const results = await Promise.allSettled([
                service.provision({ email: 'race@example.com', password: 'first long password' }),
                service.provision({ email: 'race@example.com', password: 'second long password' }),
            ]);
            expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
            expect(results.filter(({ status }) => status === 'rejected')[0].reason.statusCode).toBe(409);
        });
    });
});

describe.skipIf(process.env.DATABASE_TESTS !== '1')('authentication migration preservation', () => {
    it('backfills existing favorites without replacing identities or timestamps', async () => {
        const client = new pg.Client({ connectionString: validateDatabaseEnvironment(loadEnvironment()).databaseUrl });
        await client.connect();
        try {
            await client.query('BEGIN');
            const schema = `auth_migration_${randomUUID().replaceAll('-', '')}`;
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET LOCAL search_path TO "${schema}"`);
            const migrations = await readTestMigrations({ before: '20261009180000_authentication' });
            for (const sql of migrations) await client.query(sql);
            const mediaId = randomUUID();
            const favoriteId = randomUUID();
            const createdAt = new Date('2026-10-01T00:00:00Z');
            await client.query(
                "INSERT INTO media (id, type, original_filename, mime_type, extension, file_size, updated_at) VALUES ($1, 'IMAGE', 'photo.jpg', 'image/jpeg', 'jpg', 10, now())",
                [mediaId],
            );
            await client.query('INSERT INTO favorites (id, media_id, created_at) VALUES ($1, $2, $3)', [
                favoriteId,
                mediaId,
                createdAt,
            ]);
            await client.query(
                await readFile(
                    new URL(
                        '../../../../prisma/migrations/20261009180000_authentication/migration.sql',
                        import.meta.url,
                    ),
                    'utf8',
                ),
            );
            const { rows } = await client.query('SELECT id, media_id, user_id, created_at FROM favorites');
            expect(rows).toEqual([
                { id: favoriteId, media_id: mediaId, user_id: LEGACY_OWNER_ID, created_at: createdAt },
            ]);
            const owner = await client.query('SELECT password_hash FROM users WHERE id = $1', [LEGACY_OWNER_ID]);
            expect(owner.rows[0].password_hash).toBeNull();
        } finally {
            await client.query('ROLLBACK');
            await client.end();
        }
    });
});
