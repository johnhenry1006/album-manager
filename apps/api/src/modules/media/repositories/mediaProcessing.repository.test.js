import { expect, it, vi } from 'vitest';

import { createMediaProcessingRepository } from './mediaProcessing.repository.js';

const mediaId = 'a0000000-0000-4000-8000-000000000001';
const uploadFileId = 'a0000000-0000-4000-8000-000000000002';
function setup() {
    const transaction = {
        $queryRaw: vi.fn(async () => [{ id: mediaId }]),
        media: {
            findUnique: vi.fn(async () => ({ id: mediaId, status: 'PROCESSING' })),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        uploadFile: {
            findUnique: vi.fn(async () => ({ id: uploadFileId, mediaId, status: 'PROCESSING' })),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        mediaVariant: { findFirst: vi.fn() },
        mediaMetadata: { upsert: vi.fn() },
    };
    const client = { ...transaction, $transaction: vi.fn(async (run) => run(transaction)) };
    return { client, transaction, repository: createMediaProcessingRepository(client) };
}
it('serializes checksum checks in a short transaction before executing detection', async () => {
    const { repository, transaction } = setup();
    const events = [];
    transaction.$queryRaw.mockImplementation(async () => {
        events.push('lock');
    });
    await repository.withChecksumLock('a'.repeat(64), async (scoped) => {
        expect(scoped).toBe(transaction);
        events.push('detect');
    });
    expect(events).toEqual(['lock', 'detect']);
    expect(transaction.$queryRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
});
it('commits metadata and READY states together, clearing safe upload errors', async () => {
    const { repository, transaction } = setup();
    await repository.finish(
        mediaId,
        uploadFileId,
        { checksum: 'a'.repeat(64), width: 10, height: 5, aspectRatio: 2, mimeType: 'image/jpeg' },
        { cameraMake: 'Camera' },
    );
    expect(transaction.mediaMetadata.upsert).toHaveBeenCalledWith({
        where: { mediaId },
        create: { mediaId, cameraMake: 'Camera' },
        update: { cameraMake: 'Camera' },
    });
    expect(transaction.media.update).toHaveBeenCalledWith({
        where: { id: mediaId, deletedAt: null },
        data: {
            checksum: 'a'.repeat(64),
            width: 10,
            height: 5,
            aspectRatio: 2,
            mimeType: 'image/jpeg',
            status: 'READY',
        },
    });
    expect(transaction.uploadFile.update).toHaveBeenCalledWith({
        where: { id: uploadFileId },
        data: { status: 'READY', error: null, duplicateOfMediaId: null },
    });
});
it('does not regress a concurrent READY result when recording failure or a duplicate', async () => {
    const { repository, transaction } = setup();
    transaction.media.findUnique.mockResolvedValue({ id: mediaId, status: 'READY' });
    await repository.fail(mediaId, uploadFileId);
    await repository.markDuplicate(mediaId, uploadFileId, mediaId);
    expect(transaction.media.update).not.toHaveBeenCalled();
    expect(transaction.uploadFile.update).not.toHaveBeenCalled();
});
it('rejects an upload cancelled after the orchestration read', async () => {
    const { repository, transaction } = setup();
    transaction.uploadFile.findUnique.mockResolvedValue({ mediaId, status: 'CANCELLED' });
    await expect(repository.finish(mediaId, uploadFileId, {}, {})).rejects.toMatchObject({
        code: 'INVALID_MEDIA_INPUT',
    });
    expect(transaction.mediaMetadata.upsert).not.toHaveBeenCalled();
});
