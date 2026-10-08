import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { fixture } from './uploadTestFixture.js';

async function pending() {
    const context = fixture();
    const session = await context.service.createSession();
    const file = await context.service.registerFile(session.id, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
    });
    await context.service.presign(file.id);
    await context.service.complete(file.id);
    const existingId = randomUUID();
    context.media.set(existingId, { ...context.media.get(file.mediaId), id: existingId, status: 'READY' });
    context.media.get(file.mediaId).status = 'PENDING';
    Object.assign(file, { status: 'DUPLICATE_PENDING', duplicateOfMediaId: existingId });
    context.queue.enqueueMediaProcessing.mockClear();
    return { ...context, file, existingId };
}

describe('explicit duplicate resolution', () => {
    it.each(['SKIP', 'USE_EXISTING'])('cleans the temporary upload for %s', async (action) => {
        const context = await pending();
        const { file, existingId, service } = context;
        const temporaryId = file.mediaId;
        const originalKey = [...context.variants.values()][0].storageKey;
        const stagingKey = file.storageKey;
        const result = await service.resolveDuplicate(file.id, { action });
        expect(result).toEqual({
            uploadFileId: file.id,
            status: action === 'SKIP' ? 'CANCELLED' : 'READY',
            finalMediaId: action === 'SKIP' ? null : existingId,
            duplicateOfMediaId: existingId,
        });
        expect(file.mediaId).toBe(action === 'SKIP' ? null : existingId);
        expect(file.storageKey).toBeNull();
        expect(context.storage.delete).toHaveBeenCalledWith({ key: stagingKey });
        expect(context.storage.delete).toHaveBeenCalledWith({ key: originalKey });
        expect(context.media.get(temporaryId).deletedAt).toBeInstanceOf(Date);
        expect(context.media.get(existingId).deletedAt).toBeUndefined();
        expect(context.queue.enqueueMediaProcessing).not.toHaveBeenCalled();
        expect(context.sessions.get(file.uploadSessionId).status).toBe(action === 'SKIP' ? 'CANCELLED' : 'COMPLETED');
    });
    it('keeps the original and enqueues processing with explicit duplicate admission', async () => {
        const context = await pending();
        const { file, service, existingId } = context;
        const temporaryId = file.mediaId;
        expect(await service.resolveDuplicate(file.id, { action: 'KEEP_BOTH' })).toEqual({
            uploadFileId: file.id,
            status: 'PROCESSING',
            finalMediaId: null,
            duplicateOfMediaId: existingId,
        });
        expect(context.queue.enqueueMediaProcessing).toHaveBeenCalledWith({
            mediaId: temporaryId,
            uploadFileId: file.id,
            allowDuplicate: true,
        });
        expect(file.processingAcceptedAt).toBeInstanceOf(Date);
        expect(file.mediaId).toBe(temporaryId);
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it('does not advance a duplicate when queue acceptance fails', async () => {
        const context = await pending();
        context.queue.enqueueMediaProcessing.mockRejectedValueOnce(new Error('unavailable'));
        await expect(context.service.resolveDuplicate(context.file.id, { action: 'KEEP_BOTH' })).rejects.toMatchObject({
            statusCode: 503,
        });
        expect(context.file.status).toBe('DUPLICATE_PENDING');
        expect(context.storage.delete).not.toHaveBeenCalled();
        expect(await context.service.resolveDuplicate(context.file.id, { action: 'KEEP_BOTH' })).toMatchObject({
            status: 'PROCESSING',
        });
    });
    it('preserves a referenced temporary media record and its original', async () => {
        const context = await pending();
        const media = context.media.get(context.file.mediaId);
        media.referenced = true;
        await context.service.resolveDuplicate(context.file.id, { action: 'SKIP' });
        expect(media.deletedAt).toBeUndefined();
        expect(context.storage.delete).toHaveBeenCalledTimes(1);
    });
    it('rejects a staging key outside this upload before deleting anything', async () => {
        const context = await pending();
        context.file.storageKey = 'media/someone-elses-original';
        await expect(context.service.resolveDuplicate(context.file.id, { action: 'SKIP' })).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it.each([{}, { action: 'DELETE' }, { action: 'SKIP', extra: true }])('rejects invalid action %j', async (input) => {
        const context = await pending();
        await expect(context.service.resolveDuplicate(context.file.id, input)).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it('rejects resolving a file outside DUPLICATE_PENDING', async () => {
        const context = await pending();
        context.file.status = 'PROCESSING';
        await expect(context.service.resolveDuplicate(context.file.id, { action: 'SKIP' })).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it('does not enqueue KEEP_BOTH when a previous cleanup removed the original', async () => {
        const context = await pending();
        context.storage.getObjectMetadata.mockResolvedValue(null);
        await expect(context.service.resolveDuplicate(context.file.id, { action: 'KEEP_BOTH' })).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(context.file.status).toBe('DUPLICATE_PENDING');
        expect(context.queue.enqueueMediaProcessing).not.toHaveBeenCalled();
    });
    it('does not resolve USE_EXISTING to media that is no longer ready', async () => {
        const context = await pending();
        context.media.get(context.existingId).status = 'FAILED';
        await expect(
            context.service.resolveDuplicate(context.file.id, { action: 'USE_EXISTING' }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(context.storage.delete).not.toHaveBeenCalled();
    });
    it('leaves a failed cleanup pending for retry', async () => {
        const context = await pending();
        context.storage.delete.mockRejectedValueOnce(new Error('Unavailable'));
        await expect(context.service.resolveDuplicate(context.file.id, { action: 'SKIP' })).rejects.toMatchObject({
            statusCode: 503,
        });
        expect(context.file.status).toBe('DUPLICATE_PENDING');
        expect(await context.service.resolveDuplicate(context.file.id, { action: 'SKIP' })).toMatchObject({
            status: 'CANCELLED',
        });
    });
});
