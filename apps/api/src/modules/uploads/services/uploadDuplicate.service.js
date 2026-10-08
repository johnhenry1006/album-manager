import { validateDuplicateResolution, validateUploadId } from '../validators/upload.validator.js';
import { uploadConflict, UploadError, uploadNotFound } from './upload.errors.js';

export function createUploadDuplicateService({ storage, queue, withFileLock, refreshSession }) {
    return Object.freeze({
        async resolve(uploadFileId, input) {
            validateUploadId(uploadFileId);
            const action = validateDuplicateResolution(input);
            return withFileLock(uploadFileId, async ({ repository, mediaService, mediaUploadCleanupService }) => {
                const file = await repository.findFile(uploadFileId);
                if (!file) throw uploadNotFound();
                if (
                    file.status !== 'DUPLICATE_PENDING' ||
                    !file.mediaId ||
                    !file.duplicateOfMediaId ||
                    file.mediaId === file.duplicateOfMediaId
                )
                    throw uploadConflict();
                let resolved;
                if (action === 'KEEP_BOTH') {
                    if (!(await mediaUploadCleanupService.originalExists(file.mediaId))) throw uploadConflict();
                    // Keep the file lock until acceptance so SKIP cannot delete a queued original.
                    try {
                        await queue.enqueueMediaProcessing({
                            mediaId: file.mediaId,
                            uploadFileId,
                            allowDuplicate: true,
                        });
                    } catch {
                        throw new UploadError(
                            'UPLOAD_QUEUE_UNAVAILABLE',
                            'Processing job could not be accepted; retry resolution',
                            503,
                        );
                    }
                    resolved = await repository.updateFile(file.id, {
                        status: 'PROCESSING',
                        processingAcceptedAt: new Date(),
                        error: null,
                    });
                } else {
                    if (action === 'USE_EXISTING') {
                        const existing = await mediaService.load(file.duplicateOfMediaId);
                        if (existing.status !== 'READY') throw uploadConflict();
                    }
                    if (
                        file.storageKey &&
                        (file.storageKey !== `uploads/${file.uploadSessionId}/${file.id}/source` ||
                            (await mediaUploadCleanupService.storageKeyIsReferenced(file.storageKey, file.id)))
                    )
                        throw uploadConflict();
                    try {
                        await mediaUploadCleanupService.cleanup(file);
                        if (file.storageKey) await storage.delete({ key: file.storageKey });
                    } catch {
                        throw new UploadError(
                            'UPLOAD_CLEANUP_UNAVAILABLE',
                            'Temporary upload could not be cleaned; retry resolution',
                            503,
                        );
                    }
                    resolved = await repository.updateFile(file.id, {
                        status: action === 'SKIP' ? 'CANCELLED' : 'READY',
                        mediaId: action === 'SKIP' ? null : file.duplicateOfMediaId,
                        storageKey: null,
                        processingAcceptedAt: null,
                        error: null,
                    });
                }
                await refreshSession(repository, file.uploadSessionId);
                return {
                    uploadFileId: resolved.id,
                    status: resolved.status,
                    finalMediaId: resolved.status === 'READY' ? resolved.mediaId : null,
                    duplicateOfMediaId: resolved.duplicateOfMediaId,
                };
            });
        },
    });
}
