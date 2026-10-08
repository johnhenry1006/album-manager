import { Worker } from 'bullmq';

import { QUEUE_NAMES } from '#infrastructure/queue/index.js';
import { MediaDomainError } from '#modules/media/index.js';

export function createMediaProcessingWorker({
    config,
    service,
    logger,
    onFatal,
    createWorker = (name, processor, options) => new Worker(name, processor, options),
}) {
    let worker;
    let readiness;
    let closing;
    let closed = false;
    const logTransportError = () =>
        logger?.error({ queue: QUEUE_NAMES.MEDIA_PROCESSING }, 'Media worker transport error');
    function close({ force = false } = {}) {
        if (!closing) {
            closed = true;
            closing = (async () => {
                try {
                    await worker?.close(force);
                } catch {
                    throw new Error('Media worker shutdown failed');
                }
            })();
        }
        return closing;
    }
    function ready() {
        if (closed) return Promise.reject(new Error('Media worker is closed'));
        readiness ??= (async () => {
            try {
                worker = createWorker(
                    QUEUE_NAMES.MEDIA_PROCESSING,
                    async (job) => {
                        if (job.name !== 'process-media')
                            throw new MediaDomainError('INVALID_MEDIA_INPUT', 'Unsupported media job', 400);
                        return service.process(job.data);
                    },
                    {
                        prefix: config.prefix,
                        concurrency: config.concurrency,
                        autorun: false,
                        connection: {
                            host: config.host,
                            port: config.port,
                            db: config.db,
                            password: config.password,
                            ...(config.tls ? { tls: {} } : {}),
                            connectTimeout: config.connectTimeoutMs,
                            maxRetriesPerRequest: null,
                        },
                    },
                );
                worker.on('error', logTransportError);
                worker.on('failed', (job) =>
                    logger?.error(
                        {
                            queue: QUEUE_NAMES.MEDIA_PROCESSING,
                            jobId: job?.id,
                            jobName: 'process-media',
                            attemptsMade: job?.attemptsMade,
                            code: 'MEDIA_PROCESSING_FAILED',
                        },
                        'Media job failed',
                    ),
                );
                let timer;
                try {
                    await Promise.race([
                        worker.waitUntilReady(),
                        new Promise((_resolve, reject) => {
                            timer = setTimeout(
                                () => reject(new Error('Worker startup timed out')),
                                config.connectTimeoutMs,
                            );
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                }
                if (closed) throw new Error('Worker closed during startup');
                worker.run().catch(() => {
                    logTransportError();
                    onFatal?.();
                });
            } catch {
                await close({ force: true }).catch(() => {});
                throw new Error('Media worker readiness failed');
            }
        })();
        return readiness;
    }
    return Object.freeze({ ready, close });
}
