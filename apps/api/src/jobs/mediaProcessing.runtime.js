export function createMediaProcessingRuntime({ database, storage, worker }) {
    let readiness;
    let closing;
    let closed = false;
    function close() {
        if (!closing) {
            closed = true;
            closing = (async () => {
                let failed = false;
                // Drain active jobs first, then release everything even if cleanup fails.
                for (const cleanup of [() => worker.close(), () => storage.close(), () => database.disconnect()]) {
                    try {
                        await cleanup();
                    } catch {
                        failed = true;
                    }
                }
                if (failed) throw new Error('Media processing shutdown failed');
            })();
        }
        return closing;
    }
    function ready() {
        if (closed) return Promise.reject(new Error('Media processing runtime is closed'));
        readiness ??= (async () => {
            try {
                await database.connect();
                if (closed) throw new Error('Runtime closed during startup');
                await worker.ready();
            } catch {
                await close().catch(() => {});
                throw new Error('Media processing startup failed');
            }
        })();
        return readiness;
    }
    return Object.freeze({ ready, close });
}
