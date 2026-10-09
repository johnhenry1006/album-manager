import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { fixture } from './uploadTestFixture.js';

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
            contentLength: 100,
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
