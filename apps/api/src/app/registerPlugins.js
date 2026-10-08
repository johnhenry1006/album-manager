import healthModule from '#modules/health/index.js';
import { mediaDetailRoutes, mediaRoutes } from '#modules/media/index.js';
import { uploadRoutes } from '#modules/uploads/index.js';
import errorHandlingPlugin from '#shared/middleware/errorHandling.plugin.js';

export function registerPlugins(app, config, { uploadService, mediaListService, mediaDetailService } = {}) {
    app.register(errorHandlingPlugin);
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
            if (uploadService) api.register(uploadRoutes, { service: uploadService });
            if (mediaListService) api.register(mediaRoutes, { service: mediaListService });
            if (mediaDetailService) api.register(mediaDetailRoutes, { service: mediaDetailService });
        },
        { prefix: '/api' },
    );
}
