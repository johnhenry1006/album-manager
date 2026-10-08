import { generateStorageKey } from '#infrastructure/storage/index.js';

export function createMediaUploadCleanupService({ repository, storage }) {
    return Object.freeze({
        storageKeyIsReferenced(key, uploadFileId) {
            return repository.keyIsReferenced(key, uploadFileId);
        },
        async originalExists(mediaId) {
            const original = await repository.findOriginal(mediaId);
            return Boolean(original && (await storage.getObjectMetadata({ key: original.storageKey })));
        },
        async cleanup(file) {
            if (!file.mediaId || file.mediaId === file.duplicateOfMediaId || file.processingAcceptedAt) return;
            const candidate = await repository.loadCandidate(file.mediaId, file.id);
            if (!candidate) return;
            // Only the immutable original made by completion belongs to this upload.
            const originalKey = generateStorageKey({
                id: candidate.id,
                createdAt: file.createdAt,
                filename: `source.${candidate.extension}`,
            });
            if (candidate.variants.some((variant) => variant.type !== 'ORIGINAL' || variant.storageKey !== originalKey))
                return;
            if (await repository.originalHasUploadAlias(originalKey, file.id)) return;
            for (const variant of candidate.variants) await storage.delete({ key: variant.storageKey });
            await repository.retire(candidate.id);
        },
    });
}
