import { validateDatabaseEnvironment } from '#config/database.js';
import { loadConfig, loadEnvironment } from '#config/loadConfig.js';
import { validateQueueEnvironment } from '#config/queue.js';
import { validateStorageEnvironment } from '#config/storage.js';
import { createDatabase } from '#infrastructure/database/index.js';
import { createStorageProvider } from '#infrastructure/storage/index.js';

import { createJobRuntime } from './jobRuntime.js';

export async function startMediaWorker({
    createJob,
    createWorker,
    createScheduler,
    validateJobEnvironment = () => ({}),
    logger = console,
    runtime = process,
    label = 'Media processing',
}) {
    const environment = loadEnvironment();
    const config = loadConfig({ environment });
    const databaseConfig = validateDatabaseEnvironment(environment);
    const storageConfig = validateStorageEnvironment(environment);
    const queueConfig = validateQueueEnvironment(environment);
    const jobConfig = validateJobEnvironment(environment);
    const database = createDatabase(databaseConfig);
    let storage;
    let worker;
    let owner;
    let scheduler;
    let fatal = false;
    const handlers = new Map();
    const removeHandlers = () => {
        for (const [signal, handler] of handlers) runtime.removeListener(signal, handler);
    };
    try {
        storage = createStorageProvider(storageConfig);
        const service = createJob({
            client: database.client,
            storage,
            config: jobConfig,
            logger,
        });
        scheduler = createScheduler?.({ config: queueConfig, logger });
        worker = createWorker({
            config: queueConfig,
            service,
            logger,
            onFatal: () => {
                fatal = true;
                runtime.exitCode = 1;
                removeHandlers();
                void owner.close().catch(() => logger.error(`${label} worker shutdown failed`));
            },
        });
        owner = createJobRuntime({ database, storage, worker, scheduler, label });
        await owner.ready();
        if (fatal) throw new Error('Worker stopped during startup');
        let stopping = false;
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const handler = async () => {
                if (stopping) return;
                stopping = true;
                const timer = setTimeout(() => {
                    logger.error(`${label} worker shutdown timed out`);
                    runtime.exit(1);
                }, config.shutdownTimeoutMs);
                timer.unref();
                try {
                    await owner.close();
                } catch {
                    runtime.exitCode = 1;
                    logger.error(`${label} worker shutdown failed`);
                } finally {
                    clearTimeout(timer);
                    removeHandlers();
                }
            };
            handlers.set(signal, handler);
            runtime.on(signal, handler);
        }
        return Object.freeze({
            close: async () => {
                removeHandlers();
                await owner.close();
            },
        });
    } catch {
        removeHandlers();
        if (owner) await owner.close().catch(() => {});
        else {
            await Promise.allSettled([
                Promise.resolve().then(() => worker?.close()),
                Promise.resolve().then(() => scheduler?.close()),
                Promise.resolve().then(() => storage?.close()),
                database.disconnect(),
            ]);
        }
        throw new Error(`${label} startup failed`);
    }
}
