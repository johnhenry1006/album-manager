import Fastify from 'fastify';

import { validateEnvironment } from '#config/environment.js';

import { registerPlugins } from './registerPlugins.js';

export function buildApp({ config = validateEnvironment({}), logger, database } = {}) {
    const app = Fastify({
        logger: logger ?? {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
        forceCloseConnections: 'idle',
    });
    if (database) {
        app.addHook('onReady', async () => database.connect());
        app.addHook('onClose', async () => database.disconnect());
    }
    registerPlugins(app, config);
    return app;
}
