import { createMediaCleanupService, createMediaTrashModule, createMediaTrashRepository } from '#modules/media/index.js';

export function createMediaCleanupJob({ client, storage, config, logger }) {
    return createMediaCleanupService({
        repository: createMediaTrashRepository(client),
        trashService: createMediaTrashModule({ client, storage }).service,
        retentionDays: config.retentionDays,
        logger,
    });
}
