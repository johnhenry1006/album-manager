import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { createMediaCleanupScheduler, registerMediaCleanupSchedule } from './mediaCleanup.schedule.js';
import { createMediaCleanupWorker } from './mediaCleanup.worker.js';

it('upserts a stable hourly scheduler across application processes with retry options', async () => {
    const schedules = new Map();
    const queue = {
        upsertJobScheduler: vi.fn(async (id, repeat, template) => schedules.set(id, { repeat, template })),
    };
    await Promise.all([registerMediaCleanupSchedule(queue), registerMediaCleanupSchedule(queue)]);
    expect(schedules.size).toBe(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        'trash-retention-cleanup',
        { pattern: '0 0 * * * *', tz: 'UTC' },
        {
            name: 'cleanup-media',
            data: {},
            opts: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: false,
            },
        },
    );
});
it('registers explicitly once per owner and releases the queue on failure', async () => {
    const queue = {
        upsertJobScheduler: vi.fn(async () => {
            throw new Error('private');
        }),
    };
    const owner = { getQueue: vi.fn(async () => queue), close: vi.fn() };
    const scheduler = createMediaCleanupScheduler({ queue: owner });
    expect(owner.getQueue).not.toHaveBeenCalled();
    await expect(scheduler.ready()).rejects.toThrow('Cleanup schedule registration failed');
    expect(owner.close).toHaveBeenCalledOnce();
    await scheduler.close();
    expect(owner.close).toHaveBeenCalledOnce();
});
it('starts only on readiness, validates job names, propagates failures for retry and logs safely', async () => {
    const worker = Object.assign(new EventEmitter(), {
        waitUntilReady: vi.fn(),
        run: vi.fn(async () => {}),
        close: vi.fn(),
    });
    const createWorker = vi.fn(() => worker);
    const service = {
        process: vi.fn(async () => {
            throw new Error('private storage error');
        }),
    };
    const logger = { error: vi.fn() };
    const owner = createMediaCleanupWorker({
        config: { concurrency: 1, connectTimeoutMs: 1000 },
        createWorker,
        service,
        logger,
    });
    expect(createWorker).not.toHaveBeenCalled();
    await owner.ready();
    const [name, processor] = createWorker.mock.calls[0];
    expect(name).toBe('media-cleanup');
    await expect(processor({ name: 'cleanup-media', data: {} })).rejects.toThrow('private storage error');
    await expect(processor({ name: 'unknown', data: {} })).rejects.toThrow();
    expect(service.process).toHaveBeenCalledOnce();
    worker.emit('failed', { id: 'job', attemptsMade: 1, data: { secret: 'private' } }, new Error('private'));
    expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ queue: 'media-cleanup', jobId: 'job', attemptsMade: 1 }),
        expect.any(String),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    await owner.close();
});
