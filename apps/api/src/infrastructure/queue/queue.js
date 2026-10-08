import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const QUEUE_NAMES = Object.freeze({ MEDIA_PROCESSING: 'media-processing' });

export function createQueueInfrastructure(
    config,
    {
        createConnection = (options) => new Redis(options),
        createQueue = (name, options) => new Queue(name, options),
        logger,
    } = {},
) {
    let connection;
    let queue;
    let readiness;
    let closing;
    let closed = false;
    const onError = () => logger?.error({ component: 'media-processing-queue' }, 'Queue transport error');
    function close() {
        if (!closing) {
            closed = true;
            closing = (async () => {
                try {
                    await queue?.close();
                } catch {
                    throw new Error('Queue shutdown failed');
                } finally {
                    connection?.disconnect();
                }
            })();
        }
        return closing;
    }
    function ready() {
        if (closed) return Promise.reject(new Error('Queue readiness failed'));
        readiness ??= (async () => {
            try {
                connection = createConnection({
                    host: config.host,
                    port: config.port,
                    password: config.password,
                    db: config.db,
                    ...(config.tls ? { tls: {} } : {}),
                    lazyConnect: true,
                    enableOfflineQueue: false,
                    maxRetriesPerRequest: 1,
                    connectTimeout: config.connectTimeoutMs,
                    commandTimeout: config.connectTimeoutMs,
                    retryStrategy: (attempt) => Math.min(attempt * 100, 2000),
                });
                connection.on('error', onError);
                await connection.connect();
                if (closed) throw new Error('Queue closed');
                queue = createQueue(QUEUE_NAMES.MEDIA_PROCESSING, {
                    connection,
                    prefix: config.prefix,
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 },
                        removeOnComplete: { count: 1000 },
                        removeOnFail: false,
                    },
                });
                queue.on('error', onError);
                await queue.waitUntilReady();
            } catch {
                await close().catch(() => {});
                throw new Error('Queue readiness failed');
            }
        })();
        return readiness;
    }
    return Object.freeze({
        ready,
        close,
        async enqueueMediaProcessing({ mediaId, uploadFileId, allowDuplicate = false }) {
            const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
            if (
                typeof mediaId !== 'string' ||
                typeof uploadFileId !== 'string' ||
                !uuid.test(mediaId) ||
                !uuid.test(uploadFileId) ||
                typeof allowDuplicate !== 'boolean'
            )
                throw new TypeError('Invalid media-processing job');
            try {
                await ready();
                if (closed) throw new Error('Queue closed');
                const data = { mediaId, uploadFileId, ...(allowDuplicate ? { allowDuplicate } : {}) };
                const job = await queue.add('process-media', data, {
                    jobId: allowDuplicate ? `${mediaId}-allow-duplicate` : mediaId,
                });
                return { jobId: job.id };
            } catch {
                throw new Error('Queue dispatch failed');
            }
        },
    });
}
