import { pathToFileURL } from 'node:url';

import { loadConfig } from '#config/loadConfig.js';

import { buildApp } from './app.js';
import { registerShutdown } from './registerShutdown.js';

export async function startServer() {
    const config = loadConfig();
    const app = buildApp({ config });
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
