import { randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';
import { expect, it } from 'vitest';

import { loadEnvironment } from '#config/loadConfig.js';
import { validateQueueEnvironment } from '#config/queue.js';

import { createMediaProcessingWorker } from '../../jobs/mediaProcessing.worker.js';
import { createQueueInfrastructure, QUEUE_NAMES } from './index.js';

it.skipIf(process.env.QUEUE_TESTS !== '1')(
    'accepts a stable processing job once in Redis',
    async () => {
        const config = { ...validateQueueEnvironment(loadEnvironment()), prefix: `upload-test-${randomUUID()}` };
        const owner = createQueueInfrastructure(config);
        const inspection = new Queue(QUEUE_NAMES.MEDIA_PROCESSING, {
            prefix: config.prefix,
            connection: {
                host: config.host,
                port: config.port,
                password: config.password,
                db: config.db,
                ...(config.tls ? { tls: {} } : {}),
                maxRetriesPerRequest: 1,
            },
        });
        inspection.on('error', () => {});
        try {
            const data = { mediaId: randomUUID(), uploadFileId: randomUUID() };
            await owner.enqueueMediaProcessing(data);
            await owner.enqueueMediaProcessing(data);
            expect(await inspection.getWaitingCount()).toBe(1);
            const job = await inspection.getJob(data.mediaId);
            expect(job.data).toEqual(data);
            expect(job.opts).toMatchObject({ attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
        } finally {
            try {
                await inspection.obliterate({ force: true });
            } finally {
                await inspection.close();
                await owner.close();
            }
        }
    },
    20000,
);

it.skipIf(process.env.QUEUE_TESTS !== '1')(
    'runs and retries a job through the dedicated worker in Redis',
    async () => {
        const config = { ...validateQueueEnvironment(loadEnvironment()), prefix: `worker-test-${randomUUID()}` };
        const producer = createQueueInfrastructure(config);
        const inspection = new Queue(QUEUE_NAMES.MEDIA_PROCESSING, {
            prefix: config.prefix,
            connection: {
                host: config.host,
                port: config.port,
                password: config.password,
                db: config.db,
                maxRetriesPerRequest: 1,
            },
        });
        inspection.on('error', () => {});
        let timer;
        const completed = Promise.withResolvers();
        let attempts = 0;
        const consumer = createMediaProcessingWorker({
            config,
            service: {
                async process(input) {
                    if (++attempts === 1) throw new Error('Transient failure');
                    return { status: 'READY', mediaId: input.mediaId };
                },
            },
            createWorker: (name, process, options) => {
                const worker = new Worker(name, process, options);
                worker.on('completed', (_job, result) => completed.resolve(result));
                return worker;
            },
        });
        try {
            timer = setTimeout(() => completed.reject(new Error('Worker test completion timed out')), 10000);
            const data = { mediaId: randomUUID(), uploadFileId: randomUUID() };
            await consumer.ready();
            await producer.enqueueMediaProcessing(data);
            expect(await completed.promise).toEqual({ status: 'READY', mediaId: data.mediaId });
            expect(attempts).toBe(2);
        } finally {
            clearTimeout(timer);
            await consumer.close();
            await inspection.obliterate({ force: true });
            await inspection.close();
            await producer.close();
        }
    },
    15000,
);
