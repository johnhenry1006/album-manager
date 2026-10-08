import { invalid } from '../services/media.errors.js';
import { validateId } from './media.validator.js';

export function validateMediaProcessingJob(input) {
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => !['mediaId', 'uploadFileId', 'allowDuplicate'].includes(key))
    )
        throw invalid('Invalid media-processing job');
    const { mediaId, uploadFileId, allowDuplicate = false } = input;
    validateId(mediaId);
    validateId(uploadFileId);
    if (typeof allowDuplicate !== 'boolean') throw invalid('Invalid duplicate policy');
    return { mediaId, uploadFileId, allowDuplicate };
}
