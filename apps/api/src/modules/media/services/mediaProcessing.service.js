import { MEDIA_FORMATS } from '#shared/constants/mediaFormats.js';

import { validateMediaProcessingJob } from '../validators/mediaProcessing.validator.js';
import { invalid, notFound } from './media.errors.js';
import { calculateMediaChecksum } from './mediaChecksum.service.js';
import { createMediaDuplicateGateService } from './mediaDuplicateGate.service.js';
import { createMediaRenditionsService } from './mediaRenditions.service.js';

export function createMediaProcessingService({
    repository,
    mediaService,
    mediaVariantService,
    storage,
    imageProcessor,
    videoProcessor,
    settingsService,
    withChecksumLock,
}) {
    const duplicateGate = createMediaDuplicateGateService({ withChecksumLock });
    const renditions = createMediaRenditionsService({ storage, mediaVariantService });
    return Object.freeze({
        async process(input) {
            const { mediaId, uploadFileId, allowDuplicate } = validateMediaProcessingJob(input);
            const media = await mediaService.load(mediaId);
            const file = await repository.loadUploadFile(uploadFileId);
            // Validate the relationship before any mutation, including failure recording.
            if (
                !file ||
                file.mediaId !== mediaId ||
                !['UPLOADING', 'PROCESSING', 'FAILED', 'DUPLICATE_PENDING', 'READY'].includes(file.status)
            )
                throw invalid('Upload does not belong to processable media');
            if (media.status === 'READY') {
                await repository.repairReadyUpload(mediaId, uploadFileId);
                return { status: 'READY', mediaId };
            }
            try {
                const original = await repository.findOriginal(mediaId);
                if (!original) throw notFound('Original variant');
                const processor =
                    media.type === 'IMAGE' ? imageProcessor : media.type === 'VIDEO' ? videoProcessor : null;
                if (!processor) throw invalid('Media processor is unavailable');
                if ((await repository.start(mediaId, uploadFileId)) === false) {
                    await repository.repairReadyUpload(mediaId, uploadFileId);
                    return { status: 'READY', mediaId };
                }
                const bytes = await storage.read({ key: original.storageKey });
                const checksum = media.checksum ?? (await calculateMediaChecksum(bytes));
                const duplicate = await duplicateGate.check({ mediaId, uploadFileId, checksum, allowDuplicate });
                if (duplicate.type === 'DUPLICATE_FOUND' && !allowDuplicate && !duplicate.admitted) {
                    await repository.markDuplicate(mediaId, uploadFileId, duplicate.existingMediaId);
                    return { status: 'DUPLICATE_PENDING', mediaId, duplicateOfMediaId: duplicate.existingMediaId };
                }
                const inspected = await processor.inspect(bytes);
                const mimeType =
                    inspected.mimeType ??
                    Object.entries(MEDIA_FORMATS).find(([, value]) => value.format === inspected.format)?.[0];
                if (
                    !mimeType ||
                    MEDIA_FORMATS[mimeType]?.type !== media.type ||
                    MEDIA_FORMATS[mimeType]?.format !== (original.format === 'jpg' ? 'jpeg' : original.format) ||
                    (media.mimeType && mimeType !== media.mimeType)
                )
                    throw invalid('Decoded media type does not match the registered upload');
                const metadata = await processor.extractMetadata(bytes);
                const settings = await settingsService.getSettings();
                const { variants } = await processor.process(bytes, settings);
                await renditions.persist(media, original, variants);
                await repository.finish(
                    mediaId,
                    uploadFileId,
                    {
                        checksum,
                        width: inspected.width,
                        height: inspected.height,
                        aspectRatio: inspected.aspectRatio,
                        mimeType,
                    },
                    metadata,
                );
                return { status: 'READY', mediaId };
            } catch (error) {
                // A failed failure-write must not hide the actionable processing error.
                await repository.fail(mediaId, uploadFileId).catch(() => {});
                throw error;
            }
        },
    });
}
