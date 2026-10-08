import { createMediaRepository } from './repositories/media.repository.js';
import { createMediaVariantRepository } from './repositories/mediaVariant.repository.js';
import { createMediaService } from './services/media.service.js';
import { createMediaVariantService } from './services/mediaVariant.service.js';

// Composition owns the database lifecycle. This also accepts a transaction client.
export function createMediaModule(client) {
    const mediaService = createMediaService({ repository: createMediaRepository(client) });
    const mediaVariantService = createMediaVariantService({
        repository: createMediaVariantRepository(client),
        mediaService,
    });
    return Object.freeze({ mediaService, mediaVariantService });
}

export { createMediaRepository, createMediaService, createMediaVariantRepository, createMediaVariantService };
export { createMediaProcessingRepository } from './repositories/mediaProcessing.repository.js';
export { MediaDomainError } from './services/media.errors.js';
export { calculateMediaChecksum } from './services/mediaChecksum.service.js';
export { createMediaProcessingService } from './services/mediaProcessing.service.js';
export { validateMediaProcessingJob } from './validators/mediaProcessing.validator.js';
