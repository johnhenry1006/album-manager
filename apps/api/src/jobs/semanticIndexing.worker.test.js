import { expect, it } from 'vitest';

import { createSemanticIndexingScheduler, createSemanticIndexingWorker } from './semanticIndexing.worker.js';

it('isolates indexing on its own queue and rejects unknown jobs', async () => {
    let processJob;
    let name;
    const worker = createSemanticIndexingWorker({
        config: { connectTimeoutMs: 100, concurrency: 1 },
        service: { reconcile: async () => ({ processed: 1, failed: 0 }) },
        createWorker: (queueName, processor) => {
            name = queueName;
            processJob = processor;
            return { on() {}, waitUntilReady: async () => {}, run: async () => {}, close: async () => {} };
        },
    });
    await worker.ready();
    expect(name).toBe('semantic-indexing');
    expect(await processJob({ name: 'reconcile-semantic', data: {} })).toEqual({ processed: 1, failed: 0 });
    await expect(processJob({ name: 'process-media', data: {} })).rejects.toMatchObject({ statusCode: 400 });
    await worker.close();
});
it('registers a singleton recurring reconciliation schedule and closes transport', async () => {
    let schedule;
    let closed = false;
    const scheduler = createSemanticIndexingScheduler({
        queue: {
            getQueue: async () => ({
                upsertJobScheduler: async (...args) => {
                    schedule = args;
                },
            }),
            close: async () => {
                closed = true;
            },
        },
    });
    await scheduler.ready();
    expect(schedule[0]).toBe('semantic-reconciliation');
    expect(schedule[1]).toEqual({ every: 60000 });
    expect(schedule[2].name).toBe('reconcile-semantic');
    await scheduler.close();
    expect(closed).toBe(true);
});
