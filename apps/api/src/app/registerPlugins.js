import cookie from '@fastify/cookie';

import { albumRoutes } from '#modules/albums/index.js';
import { authProtection, authRoutes } from '#modules/auth/index.js';
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
        authService,
        authConfig,
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
    app.register(cookie);
    app.decorateRequest('actor', null);
    app.decorateRequest('authSession', null);
    app.register(securityPlugin, { policy: config.security });
    app.register(
        async function apiRoutes(api) {
            api.register(healthModule, { version: config.version });
            if (authService) api.register(authRoutes, { service: authService, config: authConfig });
            api.register(async (protectedApi) => {
                if (!authService) return;
                await authProtection(protectedApi, { service: authService, config: authConfig });
                if (imageOptimizationSettingsService)
                    protectedApi.register(imageOptimizationSettingsRoutes, {
                        service: imageOptimizationSettingsService,
                    });
                if (storageStatisticsService)
                    protectedApi.register(storageSettingsRoutes, { service: storageStatisticsService });
                if (dashboardService) protectedApi.register(dashboardRoutes, { service: dashboardService });
                if (albumService) protectedApi.register(albumRoutes, { service: albumService });
                if (taxonomyService) protectedApi.register(taxonomyRoutes, { service: taxonomyService });
                if (uploadService) protectedApi.register(uploadRoutes, { service: uploadService });
                if (mediaListService) protectedApi.register(mediaRoutes, { service: mediaListService });
                if (mediaDetailService) protectedApi.register(mediaDetailRoutes, { service: mediaDetailService });
                if (mediaFavoriteService) protectedApi.register(mediaFavoriteRoutes, { service: mediaFavoriteService });
                if (mediaTrashService) protectedApi.register(mediaTrashRoutes, { service: mediaTrashService });
            });
        },
        { prefix: '/api' },
    );
}
