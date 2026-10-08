import { createMediaRepository } from './repositories/media.repository.js';
import { createMediaDetailRepository } from './repositories/mediaDetail.repository.js';
import { createMediaListRepository } from './repositories/mediaList.repository.js';
import { createMediaUploadCleanupRepository } from './repositories/mediaUploadCleanup.repository.js';
import { createMediaVariantRepository } from './repositories/mediaVariant.repository.js';
import { createMediaService } from './services/media.service.js';
import { createMediaDetailService } from './services/mediaDetail.service.js';
import { createMediaListService } from './services/mediaList.service.js';
import { createMediaUploadCleanupService } from './services/mediaUploadCleanup.service.js';
import { createMediaVariantService } from './services/mediaVariant.service.js';

// Composition owns the database lifecycle. This also accepts a transaction client.
export function createMediaModule(client, { storage } = {}) {
    const mediaService = createMediaService({ repository: createMediaRepository(client) });
    const mediaVariantService = createMediaVariantService({
        repository: createMediaVariantRepository(client),
        mediaService,
    });
    const cleanupRepository = createMediaUploadCleanupRepository(client);
    const mediaUploadCleanupService = createMediaUploadCleanupService({ repository: cleanupRepository, storage });
    return Object.freeze({ mediaService, mediaVariantService, mediaUploadCleanupService });
}

export { createMediaRepository, createMediaService, createMediaVariantRepository, createMediaVariantService };
export { createMediaProcessingRepository } from './repositories/mediaProcessing.repository.js';
export { MediaDomainError } from './services/media.errors.js';
export { calculateMediaChecksum } from './services/mediaChecksum.service.js';
export { createMediaProcessingService } from './services/mediaProcessing.service.js';
export { validateMediaProcessingJob } from './validators/mediaProcessing.validator.js';

export { createMediaUploadCleanupService };

export function createMediaListModule({ client, storage, config }) {
    return Object.freeze({
        service: createMediaListService({ repository: createMediaListRepository(client), storage, config }),
    });
}
export { default as mediaRoutes } from './routes/media.routes.js';

export function createMediaDetailModule({ client, storage, config }) {
    return Object.freeze({
        service: createMediaDetailService({ repository: createMediaDetailRepository(client), storage, config }),
    });
}
export { default as mediaDetailRoutes } from './routes/mediaDetail.routes.js';
