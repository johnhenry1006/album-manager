import healthModule from '#modules/health/index.js';
import errorHandlingPlugin from '#shared/middleware/errorHandling.plugin.js';

export function registerPlugins(app, config) {
    app.register(errorHandlingPlugin);
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
        },
        { prefix: '/api' },
    );
}
