import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { createQueueInfrastructure } from './index.js';

it('enqueues a stable media job with retries and closes owned resources once', async () => {
    const connection = Object.assign(new EventEmitter(), { connect: vi.fn().mockResolvedValue(), disconnect: vi.fn() });
    const queue = Object.assign(new EventEmitter(), {
        waitUntilReady: vi.fn().mockResolvedValue(),
        add: vi.fn().mockResolvedValue({ id: 'job' }),
        close: vi.fn().mockResolvedValue(),
    });
    const createConnection = vi.fn(() => connection);
    const createQueue = vi.fn(() => queue);
    const owner = createQueueInfrastructure(
        { host: 'localhost', port: 6380, db: 0, prefix: 'test', connectTimeoutMs: 1000 },
        { createConnection, createQueue },
    );
    expect(createConnection).not.toHaveBeenCalled();
    const data = {
        mediaId: 'a0000000-0000-4000-8000-000000000001',
        uploadFileId: 'a0000000-0000-4000-8000-000000000002',
    };
    await owner.enqueueMediaProcessing(data);
    expect(queue.add).toHaveBeenCalledWith('process-media', data, { jobId: data.mediaId });
    expect(createQueue.mock.calls[0][1]).toMatchObject({
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnFail: false },
    });
    await Promise.all([owner.close(), owner.close()]);
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    await expect(owner.enqueueMediaProcessing(data)).rejects.toThrow('Queue dispatch failed');
});
it('sanitizes Redis failures and releases resources on failed initialization', async () => {
    const connection = Object.assign(new EventEmitter(), {
        connect: vi.fn().mockRejectedValue(new Error('private-password')),
        disconnect: vi.fn(),
    });
    const owner = createQueueInfrastructure({}, { createConnection: () => connection });
    await expect(owner.ready()).rejects.toThrow('Queue readiness failed');
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
});
it('can enqueue duplicate acceptance after the initial job has completed', async () => {
    const connection = Object.assign(new EventEmitter(), { connect: vi.fn(), disconnect: vi.fn() });
    const queue = Object.assign(new EventEmitter(), {
        waitUntilReady: vi.fn(),
        close: vi.fn(),
        add: vi.fn(async () => ({ id: 'job' })),
    });
    const owner = createQueueInfrastructure({}, { createConnection: () => connection, createQueue: () => queue });
    const data = {
        mediaId: 'a0000000-0000-4000-8000-000000000001',
        uploadFileId: 'a0000000-0000-4000-8000-000000000002',
        allowDuplicate: true,
    };
    await owner.enqueueMediaProcessing(data);
    expect(queue.add).toHaveBeenCalledWith('process-media', data, { jobId: `${data.mediaId}-allow-duplicate` });
    await expect(owner.enqueueMediaProcessing({ ...data, allowDuplicate: 'true' })).rejects.toThrow(
        'Invalid media-processing job',
    );
    await owner.close();
});

it('owns a separate cleanup queue with the same retry defaults and rejects access after close', async () => {
    const connection = Object.assign(new EventEmitter(), { connect: vi.fn(), disconnect: vi.fn() });
    const queue = Object.assign(new EventEmitter(), { waitUntilReady: vi.fn(), close: vi.fn() });
    const createQueue = vi.fn(() => queue);
    const owner = createQueueInfrastructure(
        { prefix: 'test-cleanup' },
        {
            queueName: 'media-cleanup',
            createConnection: () => connection,
            createQueue,
        },
    );
    expect(await owner.getQueue()).toBe(queue);
    expect(createQueue).toHaveBeenCalledWith(
        'media-cleanup',
        expect.objectContaining({
            prefix: 'test-cleanup',
            defaultJobOptions: expect.objectContaining({ attempts: 3 }),
        }),
    );
    await expect(owner.enqueueMediaProcessing({})).rejects.toThrow('Unsupported queue operation');
    await owner.close();
    await expect(owner.getQueue()).rejects.toThrow();
});
