import healthModule from '#modules/health/index.js';
import { mediaRoutes } from '#modules/media/index.js';
import { uploadRoutes } from '#modules/uploads/index.js';
import errorHandlingPlugin from '#shared/middleware/errorHandling.plugin.js';

export function registerPlugins(app, config, { uploadService, mediaListService } = {}) {
    app.register(errorHandlingPlugin);
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
            if (uploadService) api.register(uploadRoutes, { service: uploadService });
            if (mediaListService) api.register(mediaRoutes, { service: mediaListService });
        },
        { prefix: '/api' },
    );
}
