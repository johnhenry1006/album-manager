import { expect, it } from 'vitest';

import { createJobRuntime } from './jobRuntime.js';

it('registers the schedule before consumption and drains before releasing all adapters', async () => {
    const calls = [];
    const runtime = createJobRuntime({
        database: { connect: async () => calls.push('db-ready'), disconnect: async () => calls.push('db-close') },
        storage: { close: async () => calls.push('storage-close') },
        worker: { ready: async () => calls.push('worker-ready'), close: async () => calls.push('worker-close') },
        scheduler: { ready: async () => calls.push('schedule-ready'), close: async () => calls.push('schedule-close') },
    });
    await Promise.all([runtime.ready(), runtime.ready()]);
    await Promise.all([runtime.close(), runtime.close()]);
    expect(calls).toEqual([
        'db-ready',
        'schedule-ready',
        'worker-ready',
        'worker-close',
        'schedule-close',
        'storage-close',
        'db-close',
    ]);
});
it('does not consume after schedule failure and still closes every resource', async () => {
    const calls = [];
    const runtime = createJobRuntime({
        database: { connect: async () => {}, disconnect: async () => calls.push('db-close') },
        storage: { close: async () => calls.push('storage-close') },
        worker: {
            ready: async () => calls.push('worker-ready'),
            close: async () => {
                calls.push('worker-close');
                throw new Error();
            },
        },
        scheduler: {
            ready: async () => {
                throw new Error('private');
            },
            close: async () => calls.push('schedule-close'),
        },
        label: 'Media cleanup',
    });
    await expect(runtime.ready()).rejects.toThrow('Media cleanup startup failed');
    expect(calls).toEqual(['worker-close', 'schedule-close', 'storage-close', 'db-close']);
});
