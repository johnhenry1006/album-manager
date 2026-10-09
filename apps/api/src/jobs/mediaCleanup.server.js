import { pathToFileURL } from 'node:url';

import { validateTrashEnvironment } from '#config/trash.js';
import { createQueueInfrastructure, QUEUE_NAMES } from '#infrastructure/queue/index.js';

import { createMediaCleanupJob } from './mediaCleanup.job.js';
import { createMediaCleanupScheduler } from './mediaCleanup.schedule.js';
import { createMediaCleanupWorker } from './mediaCleanup.worker.js';
import { startMediaWorker } from './mediaWorker.server.js';

export function startMediaCleanupWorker(options = {}) {
    return startMediaWorker({
        ...options,
        label: 'Media cleanup',
        validateJobEnvironment: validateTrashEnvironment,
        createJob: createMediaCleanupJob,
        createWorker: createMediaCleanupWorker,
        createScheduler: ({ config, logger }) =>
            createMediaCleanupScheduler({
                queue: createQueueInfrastructure(config, { queueName: QUEUE_NAMES.MEDIA_CLEANUP, logger }),
            }),
    });
}
// Importing this module (including in tests) never registers a schedule or runs a purge.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMediaCleanupWorker().catch(() => {
        console.error('Media cleanup worker startup failed');
        process.exitCode = 1;
    });
}
