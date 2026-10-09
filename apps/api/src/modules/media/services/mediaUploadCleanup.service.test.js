import { describe, expect, it, vi } from 'vitest';

import { createMediaUploadCleanupService } from './mediaUploadCleanup.service.js';

const mediaId = 'a0000000-0000-4000-8000-000000000001';
const fileId = 'a0000000-0000-4000-8000-000000000002';
const key = `media/2026/10/09/${mediaId}/original/source.jpg`;

function setup() {
    const file = { id: fileId, mediaId, createdAt: new Date('2026-10-09T00:00:00Z') };
    const candidate = { id: mediaId, extension: 'jpg', variants: [{ type: 'ORIGINAL', storageKey: key }] };
    const repository = {
        loadCandidate: vi.fn().mockResolvedValue(candidate),
        originalHasUploadAlias: vi.fn().mockResolvedValue(false),
        retire: vi.fn(),
        findOriginal: vi.fn().mockResolvedValue({ storageKey: key }),
        keyIsReferenced: vi.fn().mockResolvedValue(true),
    };
    const storage = { delete: vi.fn(), getObjectMetadata: vi.fn().mockResolvedValue({ size: 10 }) };
    return { file, candidate, repository, storage, service: createMediaUploadCleanupService({ repository, storage }) };
}

describe('abandoned upload cleanup', () => {
    it.each([{ mediaId: null }, { duplicateOfMediaId: mediaId }, { processingAcceptedAt: new Date() }])(
        'leaves admitted or reused media untouched: %j',
        async (patch) => {
            const { service, file, repository, storage } = setup();
            await service.cleanup({ ...file, ...patch });
            expect(repository.loadCandidate).not.toHaveBeenCalled();
            expect(storage.delete).not.toHaveBeenCalled();
            expect(repository.retire).not.toHaveBeenCalled();
        },
    );

    it('leaves media excluded by repository eligibility checks untouched', async () => {
        const { service, file, repository, storage } = setup();
        repository.loadCandidate.mockResolvedValue(null);
        await service.cleanup(file);
        expect(repository.loadCandidate).toHaveBeenCalledWith(mediaId, fileId);
        expect(storage.delete).not.toHaveBeenCalled();
        expect(repository.retire).not.toHaveBeenCalled();
    });

    it.each([
        { type: 'PREVIEW', storageKey: key },
        { type: 'ORIGINAL', storageKey: 'another-upload/source.jpg' },
    ])('validates the entire manifest before deleting any object: %j', async (variant) => {
        const { service, file, candidate, repository, storage } = setup();
        candidate.variants.push(variant);
        await service.cleanup(file);
        expect(storage.delete).not.toHaveBeenCalled();
        expect(repository.retire).not.toHaveBeenCalled();
    });

    it('protects originals referenced by a different upload', async () => {
        const { service, file, repository, storage } = setup();
        repository.originalHasUploadAlias.mockResolvedValue(true);
        await service.cleanup(file);
        expect(repository.originalHasUploadAlias).toHaveBeenCalledWith(key, fileId);
        expect(storage.delete).not.toHaveBeenCalled();
        expect(repository.retire).not.toHaveBeenCalled();
    });

    it('retires eligible media only after object deletion succeeds', async () => {
        const { service, file, repository, storage } = setup();
        let deleted = false;
        storage.delete.mockImplementation(async () => {
            deleted = true;
        });
        repository.retire.mockImplementation(async () => {
            expect(deleted).toBe(true);
        });
        await service.cleanup(file);
        expect(storage.delete).toHaveBeenCalledExactlyOnceWith({ key });
        expect(repository.retire).toHaveBeenCalledExactlyOnceWith(mediaId);
    });

    it('preserves the record after storage failure and permits a subsequent retry', async () => {
        const { service, file, repository, storage } = setup();
        storage.delete.mockRejectedValueOnce(new Error('Storage unavailable'));
        await expect(service.cleanup(file)).rejects.toThrow('Storage unavailable');
        expect(repository.retire).not.toHaveBeenCalled();
        await service.cleanup(file);
        expect(repository.retire).toHaveBeenCalledOnce();
    });

    it.each([null, { size: 10 }])('checks original existence through provider metadata: %j', async (metadata) => {
        const { service, repository, storage } = setup();
        storage.getObjectMetadata.mockResolvedValue(metadata);
        expect(await service.originalExists(mediaId)).toBe(Boolean(metadata));
        expect(repository.findOriginal).toHaveBeenCalledWith(mediaId);
        expect(storage.getObjectMetadata).toHaveBeenCalledWith({ key });
    });

    it('does not access storage when the original is absent', async () => {
        const { service, repository, storage } = setup();
        repository.findOriginal.mockResolvedValue(null);
        expect(await service.originalExists(mediaId)).toBe(false);
        expect(storage.getObjectMetadata).not.toHaveBeenCalled();
    });

    it('delegates reference checks with the current upload excluded', async () => {
        const { service, repository } = setup();
        expect(await service.storageKeyIsReferenced(key, fileId)).toBe(true);
        expect(repository.keyIsReferenced).toHaveBeenCalledWith(key, fileId);
    });
});
