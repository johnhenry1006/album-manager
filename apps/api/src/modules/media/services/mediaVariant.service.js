import { mapMediaVariant } from '../mappers/media.mapper.js';
import { validateId, validateVariant, validateVariantIdentity } from '../validators/media.validator.js';
import { MediaDomainError, notFound } from './media.errors.js';
import { createMediaService } from './media.service.js';

export function createMediaVariantService({ repository, mediaService }) {
    return Object.freeze({
        withMediaLock(id, run) {
            return repository.withMediaLock(validateId(id), (scoped, scopedMedia) =>
                run(
                    createMediaVariantService({
                        repository: scoped,
                        mediaService: createMediaService({ repository: scopedMedia }),
                    }),
                ),
            );
        },
        async create(input) {
            const data = validateVariant(input, { create: true });
            await mediaService.load(data.mediaId);
            const variant = await (data.type === 'ORIGINAL'
                ? repository.createOriginal(data)
                : repository.create(data));
            return mapMediaVariant(variant);
        },
        async update(id, input) {
            const data = validateVariant(input);
            const variant = await repository.findById(validateId(id));
            if (!variant) throw notFound('Media variant');
            if (variant.type === 'ORIGINAL')
                throw new MediaDomainError('ORIGINAL_IMMUTABLE', 'Original variants cannot be updated', 409);
            return mapMediaVariant(await repository.update(id, data));
        },
        async load(id) {
            const variant = await repository.findById(validateId(id));
            if (!variant) throw notFound('Media variant');
            return mapMediaVariant(variant);
        },
        async findByIdentity(input) {
            return mapMediaVariant(await repository.findByIdentity(validateVariantIdentity(input)));
        },
    });
}
