import { expect, it, vi } from 'vitest';

import { createMediaProcessingRuntime } from './mediaProcessing.runtime.js';

it('starts the database before consuming jobs and drains jobs before releasing adapters', async () => {
    const calls = [];
    const runtime = createMediaProcessingRuntime({
        database: { connect: async () => calls.push('connect'), disconnect: async () => calls.push('disconnect') },
        storage: { close: async () => calls.push('storage-close') },
        worker: { ready: async () => calls.push('worker-ready'), close: async () => calls.push('worker-close') },
    });
    await runtime.ready();
    await Promise.all([runtime.close(), runtime.close()]);
    expect(calls).toEqual(['connect', 'worker-ready', 'worker-close', 'storage-close', 'disconnect']);
});
it('attempts all cleanup after a startup or shutdown failure', async () => {
    const database = {
        connect: vi.fn(async () => {
            throw new Error('private database url');
        }),
        disconnect: vi.fn(),
    };
    const storage = { close: vi.fn() };
    const worker = {
        ready: vi.fn(),
        close: vi.fn(async () => {
            throw new Error('private');
        }),
    };
    const runtime = createMediaProcessingRuntime({ database, storage, worker });
    await expect(runtime.ready()).rejects.toThrow('Media processing startup failed');
    expect(storage.close).toHaveBeenCalledTimes(1);
    expect(database.disconnect).toHaveBeenCalledTimes(1);
    expect(worker.ready).not.toHaveBeenCalled();
    await expect(runtime.close()).rejects.toThrow('Media processing shutdown failed');
});
