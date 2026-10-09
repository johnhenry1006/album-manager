import { createJobWorker, QUEUE_NAMES } from '#infrastructure/queue/index.js';
import { MediaDomainError } from '#modules/media/index.js';

export function createMediaProcessingWorker({ service, ...options }) {
    return createJobWorker({
        ...options,
        queueName: QUEUE_NAMES.MEDIA_PROCESSING,
        jobName: 'process-media',
        failureCode: 'MEDIA_PROCESSING_FAILED',
        processor: async (job) => {
            if (job.name !== 'process-media')
                throw new MediaDomainError('INVALID_MEDIA_INPUT', 'Unsupported media job', 400);
            return service.process(job.data);
        },
    });
}
