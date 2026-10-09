import { createJobWorker, QUEUE_NAMES } from '#infrastructure/queue/index.js';

export function createSemanticIndexingWorker({ service, ...options }) {
    return createJobWorker({
        ...options,
        queueName: QUEUE_NAMES.SEMANTIC_INDEXING,
        jobName: 'reconcile-semantic',
        failureCode: 'SEMANTIC_INDEX_FAILED',
        label: 'Semantic indexing',
        processor: async (job) => {
            if (job.name !== 'reconcile-semantic')
                throw Object.assign(new Error('Unsupported semantic job'), { statusCode: 400 });
            return service.reconcile(job.data);
        },
    });
}
export function createSemanticIndexingScheduler({ queue }) {
    let readiness;
    let closing;
    let closed = false;
    function close() {
        closed = true;
        closing ??= Promise.resolve().then(() => queue.close());
        return closing;
    }
    return Object.freeze({
        close,
        ready() {
            if (closed) return Promise.reject(new Error('Semantic scheduler closed'));
            readiness ??= (async () => {
                try {
                    const transport = await queue.getQueue();
                    if (closed) throw new Error('Semantic scheduler closed');
                    await transport.upsertJobScheduler(
                        'semantic-reconciliation',
                        { every: 60000 },
                        {
                            name: 'reconcile-semantic',
                            data: {},
                            opts: {
                                attempts: 3,
                                backoff: { type: 'exponential', delay: 1000 },
                                removeOnComplete: { count: 1000 },
                                removeOnFail: { count: 1000 },
                            },
                        },
                    );
                } catch {
                    await close().catch(() => {});
                    throw new Error('Semantic schedule registration failed');
                }
            })();
            return readiness;
        },
    });
}
