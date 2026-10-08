import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateUploadEnvironment } from '#config/uploads.js';
import { createMediaService, createMediaVariantService } from '#modules/media/index.js';

import { createUploadService } from '../index.js';

export function fixture(policy = {}) {
    const sessions = new Map();
    const files = new Map();
    const media = new Map();
    const variants = new Map();
    const repository = {
        async createSession() {
            const row = { id: randomUUID(), status: 'REGISTERED', createdAt: new Date(), completedAt: null };
            sessions.set(row.id, row);
            return row;
        },
        async findSession(id) {
            return sessions.get(id) ?? null;
        },
        async updateSession(id, data) {
            Object.assign(sessions.get(id), data);
        },
        async countFiles(id) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).length;
        },
        async createFile(data) {
            const row = {
                id: randomUUID(),
                status: 'REGISTERED',
                createdAt: new Date(),
                updatedAt: new Date(),
                mediaId: null,
                storageKey: null,
                error: null,
                ...data,
            };
            files.set(row.id, row);
            return row;
        },
        async findFile(id) {
            return files.get(id) ?? null;
        },
        async updateFile(id, data) {
            return Object.assign(files.get(id), data);
        },
        async listFiles(id, { limit }) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).slice(0, limit + 1);
        },
        async fileStatuses(id) {
            return [...files.values()].filter((file) => file.uploadSessionId === id).map((file) => file.status);
        },
    };
    const mediaService = createMediaService({
        repository: {
            async create(data) {
                const row = { id: randomUUID(), createdAt: new Date(), ...data };
                media.set(row.id, row);
                return row;
            },
            async findById(id) {
                return media.get(id);
            },
        },
    });
    const mediaVariantService = createMediaVariantService({
        mediaService,
        repository: {
            async createOriginal(data) {
                const row = { id: randomUUID(), ...data };
                variants.set(row.id, row);
                return row;
            },
        },
    });
    const storage = {
        createPresignedUploadUrl: vi.fn(async () => ({
            url: 'https://storage.test/upload',
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            expiresIn: 900,
        })),
        getObjectMetadata: vi.fn(async ({ key }) => ({
            key,
            fileSize: 100,
            contentType: 'image/jpeg',
            etag: '"etag"',
        })),
        copyObject: vi.fn(async () => ({})),
    };
    const queue = { enqueueMediaProcessing: vi.fn(async () => ({ id: 'job' })) };
    let pending = Promise.resolve();
    function locked(_id, run) {
        const result = pending.then(() => run({ repository, mediaService, mediaVariantService }));
        pending = result.catch(() => {});
        return result;
    }
    const service = createUploadService({
        repository,
        storage,
        queue,
        config: { ...validateUploadEnvironment({}), ...policy },
        withSessionLock: locked,
        withFileLock: locked,
    });
    return { service, repository, storage, queue, sessions, files, media, variants };
}

const source = { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100 };

describe('upload domain', () => {
    let context;
    let session;
    beforeEach(async () => {
        context = fixture();
        session = await context.service.createSession();
    });
    it('creates an empty registered session', async () => {
        expect(session).toMatchObject({ status: 'REGISTERED' });
        expect(await context.service.loadSession(session.id)).toMatchObject({ id: session.id, files: [] });
    });
    it.each([
        { filename: '../photo.jpg' },
        { filename: 'dir\\photo.jpg' },
        { filename: '.hidden' },
        { filename: 'bad\n.jpg' },
        { mimeType: 'text/html' },
        { fileSize: 0 },
        { fileSize: 999999999999 },
        { filename: 'photo.jpg', mediaId: randomUUID() },
    ])('rejects invalid file metadata %j before registration', async (patch) => {
        await expect(context.service.registerFile(session.id, { ...source, ...patch })).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(context.files.size).toBe(0);
    });
    it('enforces the configured session file count', async () => {
        context = fixture({ maxFilesPerSession: 1 });
        session = await context.service.createSession();
        const results = await Promise.allSettled([
            context.service.registerFile(session.id, source),
            context.service.registerFile(session.id, source),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(context.files.size).toBe(1);
    });
    it('presigns a server-selected staging key and marks the file uploading', async () => {
        const file = await context.service.registerFile(session.id, source);
        const result = await context.service.presign(file.id);
        expect(result).toMatchObject({
            uploadFileId: file.id,
            status: 'UPLOADING',
            method: 'PUT',
            url: 'https://storage.test/upload',
        });
        expect(context.files.get(file.id).storageKey).toBe(`uploads/${session.id}/${file.id}/source`);
        expect(context.storage.createPresignedUploadUrl).toHaveBeenCalledWith({
            key: `uploads/${session.id}/${file.id}/source`,
            contentType: 'image/jpeg',
            expiresIn: 900,
        });
    });
    it('creates media and an immutable original before accepting a processing job', async () => {
        const file = await context.service.registerFile(session.id, source);
        await context.service.presign(file.id);
        context.queue.enqueueMediaProcessing.mockImplementation(async ({ mediaId, uploadFileId }) => {
            expect(context.media.get(mediaId)).toMatchObject({ status: 'PROCESSING', fileSize: 100n });
            expect([...context.variants.values()]).toContainEqual(
                expect.objectContaining({ mediaId, type: 'ORIGINAL', format: 'jpeg' }),
            );
            expect(uploadFileId).toBe(file.id);
        });
        const result = await context.service.complete(file.id);
        expect(result).toEqual({ uploadFileId: file.id, status: 'PROCESSING', mediaId: expect.any(String) });
        expect(context.storage.copyObject).toHaveBeenCalledWith(
            expect.objectContaining({ sourceKey: `uploads/${session.id}/${file.id}/source`, sourceEtag: '"etag"' }),
        );
        expect(context.sessions.get(session.id).status).toBe('PROCESSING');
        expect(await context.service.complete(file.id)).toEqual(result);
        expect(context.media.size).toBe(1);
        expect(context.storage.copyObject).toHaveBeenCalledTimes(1);
        expect(context.queue.enqueueMediaProcessing).toHaveBeenCalledTimes(1);
        await expect(context.service.presign(file.id)).rejects.toMatchObject({ statusCode: 409 });
    });
    it.each([null, { fileSize: 99, contentType: 'image/jpeg' }, { fileSize: 100, contentType: 'text/html' }])(
        'does not persist media or enqueue an absent/mismatched object %j',
        async (metadata) => {
            const file = await context.service.registerFile(session.id, source);
            await context.service.presign(file.id);
            context.storage.getObjectMetadata.mockResolvedValue(metadata);
            await expect(context.service.complete(file.id)).rejects.toMatchObject({ statusCode: expect.any(Number) });
            expect(context.media.size).toBe(0);
            expect(context.queue.enqueueMediaProcessing).not.toHaveBeenCalled();
        },
    );
    it('retries queue acceptance without recreating media or copying over the original', async () => {
        const file = await context.service.registerFile(session.id, source);
        await context.service.presign(file.id);
        context.queue.enqueueMediaProcessing.mockRejectedValueOnce(new Error('Redis unavailable'));
        await expect(context.service.complete(file.id)).rejects.toMatchObject({ statusCode: 503 });
        expect(context.files.get(file.id)).toMatchObject({ status: 'UPLOADING', mediaId: expect.any(String) });
        await expect(context.service.presign(file.id)).rejects.toMatchObject({ statusCode: 409 });
        expect(await context.service.complete(file.id)).toMatchObject({ status: 'PROCESSING' });
        expect(context.media.size).toBe(1);
        expect(context.variants.size).toBe(1);
        expect(context.storage.copyObject).toHaveBeenCalledTimes(1);
    });
    it('serializes concurrent completion requests to one media identity', async () => {
        const file = await context.service.registerFile(session.id, source);
        await context.service.presign(file.id);
        const results = await Promise.all([context.service.complete(file.id), context.service.complete(file.id)]);
        expect(results[0].mediaId).toBe(results[1].mediaId);
        expect(context.media.size).toBe(1);
        expect(context.variants.size).toBe(1);
    });
});

it('reports a completed session after workers mark all files ready', async () => {
    const context = fixture();
    const session = await context.service.createSession();
    const file = await context.service.registerFile(session.id, source);
    context.files.get(file.id).status = 'READY';
    expect(await context.service.loadSession(session.id)).toMatchObject({ status: 'COMPLETED' });
});
