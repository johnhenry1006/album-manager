// BullMQ 6 Job Schedulers atomically upsert this identity within the queue/prefix.
// Keep every process on the same schedule ID: process IDs would create duplicates.
export function registerMediaCleanupSchedule(queue) {
    return queue.upsertJobScheduler(
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
}

export function createMediaCleanupScheduler({ queue }) {
    let readiness;
    let closing;
    let closed = false;
    function close() {
        closed = true;
        closing ??= Promise.resolve().then(() => queue.close());
        return closing;
    }
    return Object.freeze({
        close,
        ready() {
            if (closed) return Promise.reject(new Error('Cleanup scheduler is closed'));
            readiness ??= (async () => {
                try {
                    const transport = await queue.getQueue();
                    if (closed) throw new Error('Cleanup scheduler is closed');
                    await registerMediaCleanupSchedule(transport);
                } catch {
                    await close().catch(() => {});
                    throw new Error('Cleanup schedule registration failed');
                }
            })();
            return readiness;
        },
    });
}
