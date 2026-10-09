import { createJobWorker, QUEUE_NAMES } from '#infrastructure/queue/index.js';
import { MediaDomainError } from '#modules/media/index.js';

export function createMediaCleanupWorker({ service, ...options }) {
    return createJobWorker({
        ...options,
        label: 'Cleanup',
        queueName: QUEUE_NAMES.MEDIA_CLEANUP,
        jobName: 'cleanup-media',
        failureCode: 'MEDIA_CLEANUP_FAILED',
        processor: async (job) => {
            if (job.name !== 'cleanup-media')
                throw new MediaDomainError('INVALID_MEDIA_INPUT', 'Unsupported cleanup job', 400);
            return service.process(job.data);
        },
    });
}
