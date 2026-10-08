import healthModule from '#modules/health/index.js';
import { uploadRoutes } from '#modules/uploads/index.js';
import errorHandlingPlugin from '#shared/middleware/errorHandling.plugin.js';

export function registerPlugins(app, config, { uploadService } = {}) {
    app.register(errorHandlingPlugin);
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
            if (uploadService) api.register(uploadRoutes, { service: uploadService });
        },
        { prefix: '/api' },
    );
}
