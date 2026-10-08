import { pathToFileURL } from 'node:url';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadConfig, loadEnvironment } from '#config/loadConfig.js';
import { validateQueueEnvironment } from '#config/queue.js';
import { validateStorageEnvironment } from '#config/storage.js';
import { createDatabase } from '#infrastructure/database/index.js';
import { SharpImageProcessor } from '#infrastructure/image-processing/index.js';
import { createStorageProvider } from '#infrastructure/storage/index.js';

import { createMediaProcessingJob } from './mediaProcessing.job.js';
import { createMediaProcessingRuntime } from './mediaProcessing.runtime.js';
import { createMediaProcessingWorker } from './mediaProcessing.worker.js';

export async function startMediaProcessingWorker({ logger = console, runtime = process } = {}) {
    const environment = loadEnvironment();
    const config = loadConfig({ environment });
    const databaseConfig = validateDatabaseEnvironment(environment);
    const storageConfig = validateStorageEnvironment(environment);
    const queueConfig = validateQueueEnvironment(environment);
    const database = createDatabase(databaseConfig);
    let storage;
    let worker;
    let owner;
    let fatal = false;
    const handlers = new Map();
    const removeHandlers = () => {
        for (const [signal, handler] of handlers) runtime.removeListener(signal, handler);
    };
    try {
        storage = createStorageProvider(storageConfig);
        const service = createMediaProcessingJob({
            client: database.client,
            storage,
            imageProcessor: new SharpImageProcessor(),
        });
        worker = createMediaProcessingWorker({
            config: queueConfig,
            service,
            logger,
            onFatal: () => {
                fatal = true;
                runtime.exitCode = 1;
                removeHandlers();
                void owner.close().catch(() => logger.error('Media worker shutdown failed'));
            },
        });
        owner = createMediaProcessingRuntime({ database, storage, worker });
        await owner.ready();
        if (fatal) throw new Error('Worker stopped during startup');
        let stopping = false;
        for (const signal of ['SIGINT', 'SIGTERM']) {
            const handler = async () => {
                if (stopping) return;
                stopping = true;
                const timer = setTimeout(() => {
                    logger.error('Media worker shutdown timed out');
                    runtime.exit(1);
                }, config.shutdownTimeoutMs);
                timer.unref();
                try {
                    await owner.close();
                } catch {
                    runtime.exitCode = 1;
                    logger.error('Media worker shutdown failed');
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
            await Promise.allSettled([Promise.resolve().then(() => storage?.close()), database.disconnect()]);
        }
        throw new Error('Media processing startup failed');
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMediaProcessingWorker().catch(() => {
        console.error('Media processing worker startup failed');
        process.exitCode = 1;
    });
}
