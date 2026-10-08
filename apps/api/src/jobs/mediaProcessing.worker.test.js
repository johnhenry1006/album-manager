import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { createMediaProcessingWorker } from './mediaProcessing.worker.js';

function setup() {
    const worker = Object.assign(new EventEmitter(), {
        waitUntilReady: vi.fn(async () => {}),
        run: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    });
    const config = { host: 'localhost', port: 6380, db: 0, prefix: 'test', concurrency: 2, connectTimeoutMs: 1000 };
    const createWorker = vi.fn(() => worker);
    const logger = { error: vi.fn() };
    const process = vi.fn(async () => ({ status: 'READY' }));
    const onFatal = vi.fn();
    const owner = createMediaProcessingWorker({ config, service: { process }, createWorker, logger, onFatal });
    return { owner, worker, createWorker, process, logger, onFatal };
}
it('wires the BullMQ processor, retry-friendly connection and configured concurrency', async () => {
    const { owner, createWorker, process } = setup();
    await owner.ready();
    const [name, handler, options] = createWorker.mock.calls[0];
    expect(name).toBe('media-processing');
    expect(options).toMatchObject({
        concurrency: 2,
        prefix: 'test',
        autorun: false,
        connection: { maxRetriesPerRequest: null },
    });
    const data = { mediaId: 'a', uploadFileId: 'b' };
    expect(await handler({ name: 'process-media', data })).toEqual({ status: 'READY' });
    expect(process).toHaveBeenCalledWith(data);
    await expect(handler({ name: 'unknown', data })).rejects.toThrow();
    await owner.close();
});
it('logs failures without payloads or private causes and closes exactly once', async () => {
    const { owner, worker, logger } = setup();
    await Promise.all([owner.ready(), owner.ready()]);
    worker.emit(
        'failed',
        { id: 'job', name: 'process-media', attemptsMade: 2, data: { secret: 'private' } },
        new Error('private redis url'),
    );
    worker.emit('error', new Error('private redis url'));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    expect(logger.error.mock.calls[0][0]).toMatchObject({ jobId: 'job', attemptsMade: 2 });
    await Promise.all([owner.close(), owner.close()]);
    expect(worker.close).toHaveBeenCalledTimes(1);
    await expect(owner.ready()).rejects.toThrow();
});
it('cleans up after startup failure and retains a sanitized boundary error', async () => {
    const { owner, worker } = setup();
    worker.waitUntilReady.mockRejectedValue(new Error('private redis url'));
    await expect(owner.ready()).rejects.toThrow('Media worker readiness failed');
    expect(worker.close).toHaveBeenCalledTimes(1);
});

it('reports fatal consume-loop failures to the process owner', async () => {
    const { owner, worker, onFatal } = setup();
    worker.run.mockRejectedValue(new Error('private fatal failure'));
    await owner.ready();
    await Promise.resolve();
    expect(onFatal).toHaveBeenCalledWith();
    await owner.close();
});
it('bounds worker startup when Redis never becomes ready', async () => {
    vi.useFakeTimers();
    try {
        const { owner, worker } = setup();
        worker.waitUntilReady.mockImplementation(() => new Promise(() => {}));
        const result = expect(owner.ready()).rejects.toThrow('Media worker readiness failed');
        await vi.advanceTimersByTimeAsync(1001);
        await result;
        expect(worker.close).toHaveBeenCalledTimes(1);
    } finally {
        vi.useRealTimers();
    }
});
