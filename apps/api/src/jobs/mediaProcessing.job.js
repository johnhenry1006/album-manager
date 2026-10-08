import {
    createMediaModule,
    createMediaProcessingRepository,
    createMediaProcessingService,
} from '#modules/media/index.js';
import { createSettingsModule } from '#modules/settings/index.js';

export function createMediaProcessingJob({ client, storage, imageProcessor }) {
    const repository = createMediaProcessingRepository(client);
    const { mediaService, mediaVariantService } = createMediaModule(client);
    const { imageOptimizationSettingsService } = createSettingsModule(client);
    return createMediaProcessingService({
        repository,
        mediaService,
        mediaVariantService,
        storage,
        imageProcessor,
        settingsService: imageOptimizationSettingsService,
        withChecksumLock: (checksum, run) =>
            repository.withChecksumLock(checksum, (transaction) => {
                const scoped = createMediaModule(transaction);
                const admission = createMediaProcessingRepository(transaction);
                return run({
                    mediaService: scoped.mediaService,
                    duplicateDetectionService: scoped.mediaService,
                    admissionService: { load: admission.loadAdmission, accept: admission.acceptProcessing },
                });
            }),
    });
}
