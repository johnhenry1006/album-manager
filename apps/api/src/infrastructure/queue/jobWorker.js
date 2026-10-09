import { Worker } from 'bullmq';

export function createJobWorker({
    config,
    processor,
    queueName,
    jobName,
    failureCode,
    label = 'Media',
    logger,
    onFatal,
    createWorker = (name, processor, options) => new Worker(name, processor, options),
}) {
    let worker;
    let readiness;
    let closing;
    let closed = false;
    const logTransportError = () => logger?.error({ queue: queueName }, `${label} worker transport error`);
    function close({ force = false } = {}) {
        if (!closing) {
            closed = true;
            closing = (async () => {
                try {
                    await worker?.close(force);
                } catch {
                    throw new Error(`${label} worker shutdown failed`);
                }
            })();
        }
        return closing;
    }
    function ready() {
        if (closed) return Promise.reject(new Error(`${label} worker is closed`));
        readiness ??= (async () => {
            try {
                worker = createWorker(queueName, processor, {
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
                });
                worker.on('error', logTransportError);
                worker.on('failed', (job) =>
                    logger?.error(
                        {
                            queue: queueName,
                            jobId: job?.id,
                            jobName,
                            attemptsMade: job?.attemptsMade,
                            code: failureCode,
                        },
                        `${label} job failed`,
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
                throw new Error(`${label} worker readiness failed`);
            }
        })();
        return readiness;
    }
    return Object.freeze({ ready, close });
}
