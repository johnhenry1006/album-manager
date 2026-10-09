import { albumRoutes } from '#modules/albums/index.js';
import { dashboardRoutes } from '#modules/dashboard/index.js';
import healthModule from '#modules/health/index.js';
import { mediaDetailRoutes, mediaFavoriteRoutes, mediaRoutes, mediaTrashRoutes } from '#modules/media/index.js';
import { imageOptimizationSettingsRoutes, storageSettingsRoutes } from '#modules/settings/index.js';
import { taxonomyRoutes } from '#modules/taxonomy/index.js';
import { uploadRoutes } from '#modules/uploads/index.js';
import errorHandlingPlugin from '#shared/middleware/errorHandling.plugin.js';
import securityPlugin from '#shared/middleware/security.plugin.js';

export function registerPlugins(
    app,
    config,
    {
        albumService,
        dashboardService,
        imageOptimizationSettingsService,
        storageStatisticsService,
        taxonomyService,
        uploadService,
        mediaListService,
        mediaDetailService,
        mediaFavoriteService,
        mediaTrashService,
    } = {},
) {
    app.register(errorHandlingPlugin);
    app.register(securityPlugin, { policy: config.security });
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
            if (imageOptimizationSettingsService)
                api.register(imageOptimizationSettingsRoutes, { service: imageOptimizationSettingsService });
            if (storageStatisticsService) api.register(storageSettingsRoutes, { service: storageStatisticsService });
            if (dashboardService) api.register(dashboardRoutes, { service: dashboardService });
            if (albumService) api.register(albumRoutes, { service: albumService });
            if (taxonomyService) api.register(taxonomyRoutes, { service: taxonomyService });
            if (uploadService) api.register(uploadRoutes, { service: uploadService });
            if (mediaListService) api.register(mediaRoutes, { service: mediaListService });
            if (mediaDetailService) api.register(mediaDetailRoutes, { service: mediaDetailService });
            if (mediaFavoriteService) api.register(mediaFavoriteRoutes, { service: mediaFavoriteService });
            if (mediaTrashService) api.register(mediaTrashRoutes, { service: mediaTrashService });
        },
        { prefix: '/api' },
    );
}
