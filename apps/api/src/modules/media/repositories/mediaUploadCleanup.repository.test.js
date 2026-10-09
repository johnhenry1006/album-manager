import { expect, it, vi } from 'vitest';

import { createMediaUploadCleanupRepository } from './mediaUploadCleanup.repository.js';

const mediaId = 'a0000000-0000-4000-8000-000000000001';
const uploadFileId = 'a0000000-0000-4000-8000-000000000002';
const key = `media/2026/10/09/${mediaId}/original/source.jpg`;

function setup() {
    const client = {
        $queryRaw: vi.fn(),
        media: { findFirst: vi.fn(), update: vi.fn() },
        mediaVariant: { findUnique: vi.fn(), findFirst: vi.fn() },
        uploadFile: { findFirst: vi.fn() },
    };
    return { client, repository: createMediaUploadCleanupRepository(client) };
}

it.each([
    [{ id: 'variant' }, null, true],
    [null, { id: 'other-upload' }, true],
    [null, null, false],
])('detects persisted variant or other-upload references (%j, %j)', async (variant, upload, expected) => {
    const { repository, client } = setup();
    client.mediaVariant.findUnique.mockResolvedValue(variant);
    client.uploadFile.findFirst.mockResolvedValue(upload);
    expect(await repository.keyIsReferenced(key, uploadFileId)).toBe(expected);
    expect(client.mediaVariant.findUnique).toHaveBeenCalledWith({ where: { storageKey: key }, select: { id: true } });
    if (!variant)
        expect(client.uploadFile.findFirst).toHaveBeenCalledWith({
            where: { storageKey: key, id: { not: uploadFileId } },
            select: { id: true },
        });
    else expect(client.uploadFile.findFirst).not.toHaveBeenCalled();
});

it('locks the media before checking cleanup eligibility and excludes every shared relation', async () => {
    const { repository, client } = setup();
    let locked = false;
    const candidate = { id: mediaId, variants: [] };
    client.$queryRaw.mockImplementation(async () => {
        locked = true;
    });
    client.media.findFirst.mockImplementation(async () => {
        expect(locked).toBe(true);
        return candidate;
    });
    expect(await repository.loadCandidate(mediaId, uploadFileId)).toBe(candidate);
    expect(client.$queryRaw.mock.calls[0].slice(1)).toEqual([mediaId]);
    expect(client.media.findFirst).toHaveBeenCalledWith({
        where: {
            id: mediaId,
            deletedAt: null,
            status: 'PENDING',
            albums: { none: {} },
            coverForAlbums: { none: {} },
            categories: { none: {} },
            tags: { none: {} },
            favorite: { is: null },
            metadata: { is: null },
            duplicateFiles: { none: {} },
            uploadFiles: { none: { id: { not: uploadFileId } } },
        },
        include: { variants: true },
    });
});

it('does not inspect eligibility when locking fails', async () => {
    const { repository, client } = setup();
    client.$queryRaw.mockRejectedValue(new Error('Database unavailable'));
    await expect(repository.loadCandidate(mediaId, uploadFileId)).rejects.toThrow('Database unavailable');
    expect(client.media.findFirst).not.toHaveBeenCalled();
});

it('looks up originals only for live media', async () => {
    const { repository, client } = setup();
    await repository.findOriginal(mediaId);
    expect(client.mediaVariant.findFirst).toHaveBeenCalledWith({
        where: { mediaId, type: 'ORIGINAL', media: { deletedAt: null } },
    });
});

it.each([null, { id: 'alias' }])('excludes the current file when looking for original aliases: %j', async (alias) => {
    const { repository, client } = setup();
    client.uploadFile.findFirst.mockResolvedValue(alias);
    expect(await repository.originalHasUploadAlias(key, uploadFileId)).toBe(Boolean(alias));
    expect(client.uploadFile.findFirst).toHaveBeenCalledWith({
        where: { storageKey: key, id: { not: uploadFileId } },
        select: { id: true },
    });
});
