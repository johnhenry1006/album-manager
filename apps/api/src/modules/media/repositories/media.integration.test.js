import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { createPrismaClient } from '#infrastructure/database/client.js';
import { createDatabase } from '#infrastructure/database/index.js';
import { readTestMigrations } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { createMediaProcessingJob } from '../../../jobs/mediaProcessing.job.js';
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
        const migrations = await readTestMigrations();
        await admin.query('BEGIN');
        try {
            await admin.query(`CREATE SCHEMA "${schema}"`);
            await admin.query(`SET LOCAL search_path TO "${schema}"`);
            for (const migration of migrations) await admin.query(migration);
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

    it('persists accepted duplicates while excluding deleted records from active detection', async () => {
        await rollback(async (transaction, { mediaService }) => {
            const checksum = randomUUID().replaceAll('-', '').repeat(2);
            const first = await mediaService.create({ ...source, checksum });
            await transaction.media.update({
                where: { id: first.id },
                data: { deletedAt: new Date(), createdAt: new Date('2020-01-01') },
            });
            const second = await mediaService.create({ ...source, checksum });
            expect(await mediaService.findDuplicateByChecksum(checksum)).toMatchObject({ id: first.id });
            expect(await mediaService.detectDuplicateByChecksum(checksum, { excludeMediaId: second.id })).toMatchObject(
                { type: 'NEW_MEDIA' },
            );
            await expect(mediaService.load(first.id)).rejects.toMatchObject({ statusCode: 404 });
        });
    });
    it('stores independent concurrent identities with the same checksum', async () => {
        const { mediaService } = createMediaModule(database.client);
        const checksum = randomUUID().replaceAll('-', '').repeat(2);
        const [first, second] = await Promise.all([
            mediaService.create({ ...source, checksum }),
            mediaService.create({ ...source, checksum }),
        ]);
        expect(first.id).not.toBe(second.id);
        expect(await mediaService.detectDuplicateByChecksum(checksum, { excludeMediaId: first.id })).toMatchObject({
            type: 'DUPLICATE_FOUND',
            existingMediaId: second.id,
        });
    });
    it('persists three WebP thumbnail identities and rejects duplicate rendition registration', async () => {
        await rollback(async (_transaction, { mediaService, mediaVariantService }) => {
            const media = await mediaService.create(source);
            for (const size of [800, 400, 200]) {
                await mediaVariantService.create({
                    mediaId: media.id,
                    type: 'THUMBNAIL',
                    name: `thumbnail-${size}`,
                    format: 'webp',
                    fileSize: 10,
                    storageKey: `tests/${media.id}/thumbnail-${size}.webp`,
                });
            }
            await expect(
                mediaVariantService.create({
                    mediaId: media.id,
                    type: 'THUMBNAIL',
                    name: 'thumbnail-800',
                    format: 'webp',
                    fileSize: 10,
                    storageKey: `tests/${media.id}/other.webp`,
                }),
            ).rejects.toMatchObject({ code: 'VARIANT_CONFLICT' });
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
    async function uploaded() {
        const { mediaService, mediaVariantService } = createMediaModule(database.client);
        const media = await mediaService.create(source);
        await mediaVariantService.create({
            mediaId: media.id,
            type: 'ORIGINAL',
            format: 'jpeg',
            storageKey: `tests/${media.id}/source.jpg`,
            fileSize: 10,
        });
        const session = await database.client.uploadSession.create({ data: {} });
        const file = await database.client.uploadFile.create({
            data: {
                mediaId: media.id,
                uploadSessionId: session.id,
                status: 'PROCESSING',
                clientFilename: 'source.jpg',
                mimeType: 'image/jpeg',
                fileSize: 10,
            },
        });
        return { mediaId: media.id, uploadFileId: file.id };
    }
    function processing(bytes) {
        const objects = new Map();
        const storage = {
            read: async () => bytes,
            exists: async ({ key }) => objects.has(key),
            upload: async ({ key, body }) => {
                objects.set(key, body);
            },
        };
        const imageProcessor = {
            inspect: async () => ({ width: 10, height: 5, aspectRatio: 2, mimeType: 'image/jpeg' }),
            extractMetadata: async () => ({ cameraMake: 'Test camera' }),
            process: vi.fn(async () => ({
                variants: [
                    ['OPTIMIZED', 'optimized'],
                    ['PREVIEW', 'preview'],
                    ['THUMBNAIL', 'thumbnail-800'],
                    ['THUMBNAIL', 'thumbnail-400'],
                    ['THUMBNAIL', 'thumbnail-200'],
                ].map(([type, name]) => ({
                    type,
                    name,
                    format: 'webp',
                    data: Buffer.from(name),
                    width: 10,
                    height: 5,
                    fileSize: name.length,
                    contentType: 'image/webp',
                    quality: 80,
                })),
            })),
        };
        return {
            service: createMediaProcessingJob({ client: database.client, storage, imageProcessor }),
            imageProcessor,
        };
    }
    it('serializes competing checksums so only one upload is admitted by default', async () => {
        const first = await uploaded();
        const second = await uploaded();
        const { service } = processing(Buffer.from(randomUUID()));
        const results = await Promise.all([service.process(first), service.process(second)]);
        expect(results.map(({ status }) => status).sort()).toEqual(['DUPLICATE_PENDING', 'READY']);
        const ready = results.find(({ status }) => status === 'READY');
        const pending = results.find(({ status }) => status === 'DUPLICATE_PENDING');
        expect(pending.duplicateOfMediaId).toBe(ready.mediaId);
        expect(
            await database.client.mediaVariant.count({
                where: { mediaId: pending.mediaId, type: { not: 'ORIGINAL' } },
            }),
        ).toBe(0);
        expect(await database.client.mediaVariant.count({ where: { mediaId: ready.mediaId, type: 'THUMBNAIL' } })).toBe(
            3,
        );
    });
    it('retains admission across a failed attempt and subsequent explicit duplicate acceptance', async () => {
        const first = await uploaded();
        const second = await uploaded();
        const { service, imageProcessor } = processing(Buffer.from(randomUUID()));
        imageProcessor.process.mockRejectedValueOnce(new Error('Transient failure'));
        await expect(service.process(first)).rejects.toThrow('Transient failure');
        expect(
            (await database.client.uploadFile.findUnique({ where: { id: first.uploadFileId } })).processingAcceptedAt,
        ).toBeInstanceOf(Date);
        await service.process({ ...second, allowDuplicate: true });
        await service.process(first);
        const file = await database.client.uploadFile.findUnique({ where: { id: first.uploadFileId } });
        expect(file.status).toBe('READY');
        expect(await database.client.mediaMetadata.findUnique({ where: { mediaId: first.mediaId } })).toMatchObject({
            cameraMake: 'Test camera',
        });
    });
});
