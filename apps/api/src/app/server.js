import { pathToFileURL } from 'node:url';

import { validateDatabaseEnvironment } from '#config/database.js';
import { loadConfig, loadEnvironment } from '#config/loadConfig.js';
import { createDatabase } from '#infrastructure/database/index.js';

import { buildApp } from './app.js';
import { registerShutdown } from './registerShutdown.js';

export async function startServer() {
    const config = loadConfig();
    const database = createDatabase(validateDatabaseEnvironment(loadEnvironment()));
    const app = buildApp({ config, database });
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
