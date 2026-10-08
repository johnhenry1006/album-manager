import Fastify from 'fastify';

import { validateEnvironment } from '#config/environment.js';

import { registerPlugins } from './registerPlugins.js';

export function buildApp({ config = validateEnvironment({}), logger } = {}) {
    const app = Fastify({
        logger: logger ?? {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
        forceCloseConnections: 'idle',
    });
    registerPlugins(app, config);
    return app;
}
