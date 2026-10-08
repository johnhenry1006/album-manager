import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { createPrismaClient } from '#infrastructure/database/client.js';
import { createDatabase } from '#infrastructure/database/index.js';

import { createMediaModule, createMediaVariantRepository, createMediaVariantService } from '../index.js';

// Opt-in: isolated test schema; never reads or writes application tables.
describe.skipIf(process.env.DATABASE_TESTS !== '1')('media repositories with PostgreSQL', () => {
    let database;
    let admin;
    const schema = `media_test_${randomUUID().replaceAll('-', '')}`;
    beforeAll(async () => {
        const config = validateDatabaseEnvironment(loadEnvironment());
        admin = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 });
        await admin.connect();
        const migration = await readFile(
            new URL(
                '../../../../prisma/migrations/20261008040000_initial_album_manager/migration.sql',
                import.meta.url,
            ),
            'utf8',
        );
        await admin.query('BEGIN');
        try {
            await admin.query(`CREATE SCHEMA "${schema}"`);
            await admin.query(`SET LOCAL search_path TO "${schema}"`);
            await admin.query(migration);
            await admin.query('COMMIT');
        } catch (error) {
            await admin.query('ROLLBACK');
            throw error;
        }
        const isolatedUrl = new URL(config.databaseUrl);
        isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
        const isolatedConfig = { ...config, databaseUrl: isolatedUrl.toString() };
        database = createDatabase(isolatedConfig, { client: createPrismaClient(isolatedConfig, { schema }) });
        await database.connect();
    });
    afterAll(async () => {
        await database?.disconnect();
        try {
            // schema is a generated UUID name, never supplied by external input.
            if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
            await admin?.end();
        }
    });

    async function rollback(run) {
        const marker = new Error('Test rollback');
        try {
            await database.client.$transaction(async (transaction) => {
                await transaction.$queryRaw`SELECT set_config('search_path', ${schema}, true)`;
                await run(transaction, createMediaModule(transaction));
                throw marker;
            });
        } catch (error) {
            if (error !== marker) throw error;
        }
    }

    const source = {
        type: 'IMAGE',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        extension: 'jpg',
        fileSize: '5000000000',
    };

    it('persists metadata and derivatives while enforcing original immutability', async () => {
        await rollback(async (_transaction, { mediaService, mediaVariantService }) => {
            const media = await mediaService.create(source);
            await mediaService.updateMetadata(media.id, { width: 4000, height: 3000 });
            await mediaService.updateProcessingStatus(media.id, 'PROCESSING');
            expect(await mediaService.load(media.id)).toMatchObject({
                fileSize: 5000000000n,
                aspectRatio: 4 / 3,
                status: 'PROCESSING',
            });
            const original = await mediaVariantService.create({
                mediaId: media.id,
                type: 'ORIGINAL',
                format: 'jpeg',
                storageKey: `tests/${randomUUID()}/original.jpeg`,
                fileSize: 5000000000n,
            });
            await expect(mediaVariantService.update(original.id, { fileSize: 10 })).rejects.toMatchObject({
                code: 'ORIGINAL_IMMUTABLE',
            });
            await expect(
                mediaVariantService.create({
                    mediaId: media.id,
                    type: 'ORIGINAL',
                    format: 'png',
                    storageKey: `tests/${randomUUID()}/original.png`,
                    fileSize: 10,
                }),
            ).rejects.toMatchObject({ code: 'ORIGINAL_EXISTS' });
            const thumbnail = await mediaVariantService.create({
                mediaId: media.id,
                type: 'THUMBNAIL',
                format: 'webp',
                storageKey: `tests/${randomUUID()}/thumb.webp`,
                fileSize: 100,
            });
            await mediaVariantService.update(thumbnail.id, { width: 100, height: 75, quality: 80 });
            expect(await mediaVariantService.load(thumbnail.id)).toMatchObject({ width: 100, height: 75, quality: 80 });
            expect(
                await mediaVariantService.findByIdentity({ mediaId: media.id, type: 'THUMBNAIL', format: 'WEBP' }),
            ).toMatchObject({ id: thumbnail.id });
        });
    });

    it('resolves reserved checksums after a constraint error without aborting the caller transaction', async () => {
        await rollback(async (transaction, { mediaService }) => {
            const checksum = randomUUID().replaceAll('-', '').repeat(2);
            const winner = await mediaService.create({ ...source, checksum });
            await transaction.media.update({ where: { id: winner.id }, data: { deletedAt: new Date() } });
            await expect(mediaService.create({ ...source, checksum })).rejects.toMatchObject({
                code: 'DUPLICATE_MEDIA',
                existingMedia: { id: winner.id },
            });
            const pending = await mediaService.create(source);
            await expect(mediaService.updateMetadata(pending.id, { checksum })).rejects.toMatchObject({
                code: 'DUPLICATE_MEDIA',
                existingMedia: { id: winner.id },
            });
            expect(await mediaService.findDuplicateByChecksum(checksum)).toMatchObject({ id: winner.id });
            await expect(mediaService.load(winner.id)).rejects.toMatchObject({ statusCode: 404 });
            expect(await mediaService.load(pending.id)).toMatchObject({ id: pending.id, checksum: null });
        });
    });
    it('resolves concurrent checksum inserts to one identity', async () => {
        const { mediaService } = createMediaModule(database.client);
        const checksum = randomUUID().replaceAll('-', '').repeat(2);
        const results = await Promise.allSettled([
            mediaService.create({ ...source, checksum }),
            mediaService.create({ ...source, checksum }),
        ]);
        const successes = results.filter((result) => result.status === 'fulfilled');
        const conflicts = results.filter((result) => result.status === 'rejected');
        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].reason).toMatchObject({
            code: 'DUPLICATE_MEDIA',
            existingMedia: { id: successes[0].value.id },
        });
    });

    it('allows only one original when different formats are registered concurrently', async () => {
        const { mediaService, mediaVariantService } = createMediaModule(database.client);
        const media = await mediaService.create(source);
        const results = await Promise.allSettled(
            ['jpeg', 'png'].map((format) =>
                mediaVariantService.create({
                    mediaId: media.id,
                    type: 'ORIGINAL',
                    format,
                    fileSize: 10,
                    storageKey: `tests/${randomUUID()}/original.${format}`,
                }),
            ),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const conflicts = results.filter((result) => result.status === 'rejected');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].reason).toMatchObject({ code: 'ORIGINAL_EXISTS' });
    });
    it('recovers variant uniqueness failures before continuing the caller transaction', async () => {
        await rollback(async (_transaction, { mediaService, mediaVariantService }) => {
            const media = await mediaService.create(source);
            const key = `tests/${randomUUID()}/thumb.webp`;
            const first = await mediaVariantService.create({
                mediaId: media.id,
                type: 'THUMBNAIL',
                format: 'webp',
                fileSize: 10,
                storageKey: key,
            });
            const second = await mediaVariantService.create({
                mediaId: media.id,
                type: 'PREVIEW',
                format: 'webp',
                fileSize: 20,
                storageKey: `tests/${randomUUID()}/preview.webp`,
            });
            await expect(mediaVariantService.update(second.id, { storageKey: key })).rejects.toMatchObject({
                code: 'VARIANT_CONFLICT',
            });
            expect(await mediaVariantService.load(first.id)).toMatchObject({ id: first.id });
            await expect(
                mediaVariantService.create({
                    mediaId: media.id,
                    type: 'PREVIEW',
                    format: 'png',
                    fileSize: 10,
                    storageKey: key,
                }),
            ).rejects.toMatchObject({ code: 'VARIANT_CONFLICT' });
            expect(await mediaService.load(media.id)).toMatchObject({ id: media.id });
        });
    });
    it('rejects a derivative when the parent is deleted between service validation and persistence', async () => {
        const { mediaService } = createMediaModule(database.client);
        const media = await mediaService.create(source);
        const service = createMediaVariantService({
            repository: createMediaVariantRepository(database.client),
            mediaService: {
                async load(id) {
                    const liveMedia = await mediaService.load(id);
                    // Deterministically reproduce a concurrent deletion after the service read.
                    await database.client.media.update({ where: { id }, data: { deletedAt: new Date() } });
                    return liveMedia;
                },
            },
        });
        await expect(
            service.create({
                mediaId: media.id,
                type: 'THUMBNAIL',
                format: 'webp',
                fileSize: 10,
                storageKey: `tests/${randomUUID()}/thumb.webp`,
            }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(await database.client.mediaVariant.count({ where: { mediaId: media.id } })).toBe(0);
    });
});
