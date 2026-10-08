import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadEnvironment } from '#config/loadConfig.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createPrismaClient } from '#infrastructure/database/client.js';
import { createDatabase } from '#infrastructure/database/index.js';

import { buildApp } from '../../../app/app.js';

// Isolated schema, actual repositories/media domain/HTTP, transport doubles only.
describe.skipIf(process.env.DATABASE_TESTS !== '1')('upload persistence and HTTP with PostgreSQL', () => {
    const schema = `upload_test_${randomUUID().replaceAll('-', '')}`;
    let admin;
    let database;
    let app;
    const objects = new Map();
    const storage = {
        close: vi.fn(),
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
            await admin.query(
                await readFile(
                    new URL(
                        '../../../../prisma/migrations/20261008120000_media_processing/migration.sql',
                        import.meta.url,
                    ),
                    'utf8',
                ),
            );
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
});
