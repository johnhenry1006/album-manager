import { mapMedia } from '../mappers/media.mapper.js';
import { validateChecksum, validateId, validateMedia, validateStatus } from '../validators/media.validator.js';
import { notFound } from './media.errors.js';

export function createMediaService({ repository }) {
    return Object.freeze({
        async create(input) {
            return mapMedia(await repository.create(validateMedia(input, { create: true })));
        },
        async update(id, input) {
            return mapMedia(await repository.update(validateId(id), validateMedia(input)));
        },
        async updateMetadata(id, input) {
            return mapMedia(await repository.update(validateId(id), validateMedia(input, { metadataOnly: true })));
        },
        async updateProcessingStatus(id, status) {
            return mapMedia(await repository.update(validateId(id), { status: validateStatus(status) }));
        },
        async load(id) {
            const media = await repository.findById(validateId(id));
            if (!media) throw notFound();
            return mapMedia(media);
        },
        async findDuplicateByChecksum(checksum) {
            return mapMedia(await repository.findByChecksum(validateChecksum(checksum), { includeDeleted: true }));
        },
        async detectDuplicateByChecksum(inputChecksum, { excludeMediaId } = {}) {
            const checksum = validateChecksum(inputChecksum);
            if (excludeMediaId !== undefined) validateId(excludeMediaId);
            const existingMedia = mapMedia(await repository.findByChecksum(checksum, { excludeMediaId }));
            if (!existingMedia) return { type: 'NEW_MEDIA', checksum };
            return { type: 'DUPLICATE_FOUND', existingMediaId: existingMedia.id, checksum, existingMedia };
        },
    });
}
