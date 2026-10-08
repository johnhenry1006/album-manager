import { pathToFileURL } from 'node:url';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadConfig, loadEnvironment } from '#config/loadConfig.js';
import { validateMediaDetailEnvironment } from '#config/mediaDetail.js';
import { validateMediaListEnvironment } from '#config/mediaList.js';
import { validateQueueEnvironment } from '#config/queue.js';
import { validateStorageEnvironment } from '#config/storage.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createDatabase } from '#infrastructure/database/index.js';
import { createQueueInfrastructure } from '#infrastructure/queue/index.js';
import { createStorageProvider } from '#infrastructure/storage/index.js';

import { buildApp } from './app.js';
import { registerShutdown } from './registerShutdown.js';

export async function startServer() {
    const environment = loadEnvironment();
    const config = loadConfig({ environment });
    const databaseConfig = validateDatabaseEnvironment(environment);
    const storageConfig = validateStorageEnvironment(environment);
    const queueConfig = validateQueueEnvironment(environment);
    const uploadConfig = validateUploadEnvironment(environment);
    const mediaListConfig = validateMediaListEnvironment(environment);
    const mediaDetailConfig = validateMediaDetailEnvironment(environment);
    const database = createDatabase(databaseConfig);
    const storage = createStorageProvider(storageConfig);
    const queue = createQueueInfrastructure(queueConfig);
    const app = buildApp({ config, database, storage, queue, uploadConfig, mediaListConfig, mediaDetailConfig });
    const cleanup = registerShutdown(app, { timeoutMs: config.shutdownTimeoutMs });
    try {
        await app.listen({ host: config.host, port: config.port });
        return app;
    } catch (error) {
        cleanup();
        await app.close();
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startServer().catch((error) => {
        console.error(`API startup failed: ${error.message}`);
        process.exitCode = 1;
    });
}
