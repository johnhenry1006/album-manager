import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createPrismaClient } from '#infrastructure/database/client.js';
import { createDatabase } from '#infrastructure/database/index.js';
import { readTestMigrations } from '#infrastructure/database/isolatedDatabase.testUtils.js';

import { buildApp } from '../../../app/authenticatedApp.testUtils.js';

// Isolated schema, actual repositories/media domain/HTTP, transport doubles only.
describe.skipIf(process.env.DATABASE_TESTS !== '1')('upload persistence and HTTP with PostgreSQL', () => {
    const schema = `upload_test_${randomUUID().replaceAll('-', '')}`;
    let admin;
    let database;
    let app;
    const objects = new Map();
    const storage = {
        close: vi.fn(),
        delete: async ({ key }) => {
            objects.delete(key);
        },
        createPresignedUploadUrl: async () => ({
            url: 'https://storage.test/upload',
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            expiresIn: 900,
        }),
        getObjectMetadata: async ({ key }) => objects.get(key) ?? null,
        copyObject: async ({ sourceKey, destinationKey, sourceEtag }) => {
            const source = objects.get(sourceKey);
            if (source?.etag !== sourceEtag) throw new Error('Source changed');
            objects.set(destinationKey, { ...source });
        },
    };
    const queue = { ready: vi.fn(), close: vi.fn(), enqueueMediaProcessing: vi.fn(async () => ({})) };
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
        const url = new URL(config.databaseUrl);
        url.searchParams.set('options', `-c search_path=${schema}`);
        const isolatedConfig = { ...config, databaseUrl: url.toString() };
        database = createDatabase(isolatedConfig, { client: createPrismaClient(isolatedConfig, { schema }) });
        app = buildApp({
            logger: false,
            database,
            storage,
            queue,
            uploadConfig: { ...validateUploadEnvironment({}), maxFilesPerSession: 2 },
        });
        await app.ready();
    });
    afterAll(async () => {
        try {
            if (app) await app.close();
            else await database?.disconnect();
        } finally {
            try {
                if (admin) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            } finally {
                await admin?.end();
            }
        }
    });
    async function session() {
        const response = await app.inject({ method: 'POST', url: '/api/uploads/sessions' });
        expect(response.statusCode).toBe(201);
        return response.json().sessionId;
    }
    async function file(sessionId) {
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/sessions/${sessionId}/files`,
            payload: { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100 },
        });
        expect(response.statusCode).toBe(201);
        return response.json().uploadFileId;
    }
    async function presign(uploadFileId) {
        const response = await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/presign` });
        expect(response.statusCode).toBe(200);
        const persisted = await database.client.uploadFile.findUnique({ where: { id: uploadFileId } });
        objects.set(persisted.storageKey, { fileSize: 100, contentType: 'image/jpeg', etag: '"verified"' });
        return persisted;
    }
    it('completes concurrent requests with one committed Media and ORIGINAL variant', async () => {
        const sessionId = await session();
        const uploadFileId = await file(sessionId);
        const staged = await presign(uploadFileId);
        const requests = await Promise.all(
            [1, 2].map(() => app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/complete` })),
        );
        expect(requests.map((response) => response.statusCode)).toEqual([202, 202]);
        const result = requests[0].json();
        expect(requests[1].json()).toEqual(result);
        expect(result).toMatchObject({ uploadFileId, status: 'PROCESSING', mediaId: expect.any(String) });
        const media = await database.client.media.findUnique({
            where: { id: result.mediaId },
            include: { variants: true },
        });
        expect(media).toMatchObject({ status: 'PROCESSING', fileSize: 100n });
        expect(media.variants).toHaveLength(1);
        expect(media.variants[0]).toMatchObject({ type: 'ORIGINAL', format: 'jpeg', fileSize: 100n });
        expect(media.variants[0].storageKey).not.toBe(staged.storageKey);
        expect(objects.has(media.variants[0].storageKey)).toBe(true);
        expect(await database.client.media.count()).toBe(1);
        const progress = await app.inject(`/api/uploads/sessions/${sessionId}`);
        expect(progress.json()).toMatchObject({
            status: 'PROCESSING',
            files: [{ uploadFileId, mediaId: result.mediaId }],
        });
    });
    it('rolls back media persistence when storage promotion fails and permits retry', async () => {
        const uploadFileId = await file(await session());
        const staged = await presign(uploadFileId);
        const before = await database.client.media.count();
        const copy = storage.copyObject;
        storage.copyObject = async () => {
            throw new Error('Copy failed');
        };
        try {
            const response = await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/complete` });
            expect(response.statusCode).toBe(500);
            expect(await database.client.media.count()).toBe(before);
            expect(await database.client.uploadFile.findUnique({ where: { id: uploadFileId } })).toMatchObject({
                mediaId: null,
                storageKey: staged.storageKey,
                status: 'UPLOADING',
            });
        } finally {
            storage.copyObject = copy;
        }
        const retry = await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/complete` });
        expect(retry.statusCode).toBe(202);
    });
    it('enforces file count limits under concurrent registration and paginates equal timestamps', async () => {
        const sessionId = await session();
        const results = await Promise.all(
            [1, 2, 3].map(() =>
                app.inject({
                    method: 'POST',
                    url: `/api/uploads/sessions/${sessionId}/files`,
                    payload: { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100 },
                }),
            ),
        );
        expect(results.filter((response) => response.statusCode === 201)).toHaveLength(2);
        expect(results.filter((response) => response.statusCode === 400)).toHaveLength(1);
        await database.client.uploadFile.updateMany({
            where: { uploadSessionId: sessionId },
            data: { createdAt: new Date('2026-01-01') },
        });
        const first = (await app.inject(`/api/uploads/sessions/${sessionId}?limit=1`)).json();
        const second = (
            await app.inject(`/api/uploads/sessions/${sessionId}?limit=1&cursor=${first.nextCursor}`)
        ).json();
        expect(first.files).toHaveLength(1);
        expect(second.files).toHaveLength(1);
        expect(first.files[0].uploadFileId).not.toBe(second.files[0].uploadFileId);
        expect(second.nextCursor).toBeNull();
    });
    async function duplicateUpload() {
        const uploadFileId = await file(await session());
        await presign(uploadFileId);
        const completed = await app.inject({ method: 'POST', url: `/api/uploads/files/${uploadFileId}/complete` });
        const temporaryId = completed.json().mediaId;
        const existing = await database.client.media.create({
            data: {
                type: 'IMAGE',
                originalFilename: 'existing.jpg',
                mimeType: 'image/jpeg',
                extension: 'jpg',
                fileSize: 100n,
                status: 'READY',
            },
        });
        await database.client.media.update({ where: { id: temporaryId }, data: { status: 'PENDING' } });
        await database.client.uploadFile.update({
            where: { id: uploadFileId },
            data: {
                status: 'DUPLICATE_PENDING',
                duplicateOfMediaId: existing.id,
            },
        });
        const original = await database.client.mediaVariant.findFirst({ where: { mediaId: temporaryId } });
        const persisted = await database.client.uploadFile.findUnique({ where: { id: uploadFileId } });
        return {
            uploadFileId,
            temporaryId,
            existingId: existing.id,
            originalKey: original.storageKey,
            stagingKey: persisted.storageKey,
        };
    }
    it.each(['SKIP', 'USE_EXISTING', 'KEEP_BOTH'])('resolves %s through real repositories', async (action) => {
        const { uploadFileId, temporaryId, existingId, originalKey, stagingKey } = await duplicateUpload();
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
            payload: { action },
        });
        expect(response.statusCode).toBe(action === 'KEEP_BOTH' ? 202 : 200);
        expect(response.json()).toEqual({
            uploadFileId,
            status: action === 'SKIP' ? 'CANCELLED' : action === 'USE_EXISTING' ? 'READY' : 'PROCESSING',
            finalMediaId: action === 'USE_EXISTING' ? existingId : null,
            duplicateOfMediaId: existingId,
        });
        expect(objects.has(originalKey)).toBe(action === 'KEEP_BOTH');
        expect(objects.has(stagingKey)).toBe(action === 'KEEP_BOTH');
        const temporary = await database.client.media.findUnique({ where: { id: temporaryId } });
        expect(Boolean(temporary.deletedAt)).toBe(action !== 'KEEP_BOTH');
        const resolved = await database.client.uploadFile.findUnique({ where: { id: uploadFileId } });
        expect(resolved.mediaId).toBe(action === 'USE_EXISTING' ? existingId : action === 'SKIP' ? null : temporaryId);
    });
    it('preserves media referenced by an album', async () => {
        const { uploadFileId, temporaryId, originalKey } = await duplicateUpload();
        await database.client.album.create({
            data: {
                name: 'Protected',
                slug: randomUUID(),
                media: { create: { mediaId: temporaryId } },
            },
        });
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
            payload: { action: 'SKIP' },
        });
        expect(response.statusCode).toBe(200);
        expect(objects.has(originalKey)).toBe(true);
        expect((await database.client.media.findUnique({ where: { id: temporaryId } })).deletedAt).toBeNull();
    });
    it('rolls back resolution after partial storage cleanup and permits retry', async () => {
        const { uploadFileId, temporaryId, originalKey, stagingKey } = await duplicateUpload();
        const remove = storage.delete;
        storage.delete = async ({ key }) => {
            if (key === stagingKey) throw new Error('Storage unavailable');
            await remove({ key });
        };
        try {
            const response = await app.inject({
                method: 'POST',
                url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
                payload: { action: 'SKIP' },
            });
            expect(response.statusCode).toBe(503);
            expect(objects.has(originalKey)).toBe(false);
            const keep = await app.inject({
                method: 'POST',
                url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
                payload: { action: 'KEEP_BOTH' },
            });
            expect(keep.statusCode).toBe(409);
            expect((await database.client.media.findUnique({ where: { id: temporaryId } })).deletedAt).toBeNull();
            expect((await database.client.uploadFile.findUnique({ where: { id: uploadFileId } })).status).toBe(
                'DUPLICATE_PENDING',
            );
        } finally {
            storage.delete = remove;
        }
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
                    payload: { action: 'SKIP' },
                })
            ).statusCode,
        ).toBe(200);
    });

    it('serializes conflicting duplicate choices without deleting queued originals', async () => {
        const { uploadFileId, originalKey } = await duplicateUpload();
        const responses = await Promise.all(
            ['SKIP', 'KEEP_BOTH'].map((action) =>
                app.inject({
                    method: 'POST',
                    url: `/api/uploads/files/${uploadFileId}/duplicate/resolve`,
                    payload: { action },
                }),
            ),
        );
        expect(responses.filter((response) => [200, 202].includes(response.statusCode))).toHaveLength(1);
        expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
        const persisted = await database.client.uploadFile.findUnique({ where: { id: uploadFileId } });
        expect(objects.has(originalKey)).toBe(persisted.status === 'PROCESSING');
    });
});
