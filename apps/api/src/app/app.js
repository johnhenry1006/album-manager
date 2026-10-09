import Fastify from 'fastify';

import { validateAuthEnvironment } from '#config/auth.js';
import { validateEnvironment } from '#config/environment.js';
import { validateMediaDetailEnvironment } from '#config/mediaDetail.js';
import { validateMediaListEnvironment } from '#config/mediaList.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createAlbumModule } from '#modules/albums/index.js';
import { createAuthModule } from '#modules/auth/index.js';
import { createDashboardModule } from '#modules/dashboard/index.js';
import {
    createMediaDetailModule,
    createMediaFavoriteModule,
    createMediaListModule,
    createMediaTrashModule,
} from '#modules/media/index.js';
import { createSemanticSearchModule } from '#modules/semantic-search/index.js';
import { createSettingsModule, createStorageStatisticsModule } from '#modules/settings/index.js';
import { createTaxonomyModule } from '#modules/taxonomy/index.js';
import { createUploadModule } from '#modules/uploads/index.js';

import { registerPlugins } from './registerPlugins.js';

export function buildApp({
    config = validateEnvironment({}),
    logger,
    authService,
    authConfig = validateAuthEnvironment({ NODE_ENV: config.nodeEnv }),
    database,
    storage,
    queue,
    uploadService,
    uploadConfig = validateUploadEnvironment({}),
    albumService,
    dashboardService,
    imageOptimizationSettingsService,
    storageStatisticsService,
    taxonomyService,
    semanticSearchService,
    semanticProviders,
    mediaListService,
    mediaListConfig = validateMediaListEnvironment({}),
    mediaDetailService,
    mediaFavoriteService,
    mediaTrashService,
    mediaDetailConfig = validateMediaDetailEnvironment({}),
} = {}) {
    const authentication =
        authService ??
        (database?.client ? createAuthModule({ client: database.client, config: authConfig }).service : undefined);
    if (
        !authentication &&
        [
            uploadService,
            albumService,
            dashboardService,
            imageOptimizationSettingsService,
            storageStatisticsService,
            taxonomyService,
            semanticSearchService,
            semanticProviders,
            mediaListService,
            mediaDetailService,
            mediaFavoriteService,
            mediaTrashService,
        ].some(Boolean)
    )
        throw new Error('Authentication is required for business routes');
    const app = Fastify({
        bodyLimit: 64 * 1024,
        requestTimeout: 30000,
        ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
        logger: logger ?? {
            level: config.logLevel,
            serializers: {
                req: (request) => ({
                    method: request.method,
                    url: request.url?.split('?')[0],
                    remoteAddress: request.ip,
                }),
            },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
        forceCloseConnections: 'idle',
    });
    if (database) {
        app.addHook('onReady', async () => database.connect());
        app.addHook('onClose', async () => database.disconnect());
    }
    if (storage) app.addHook('onClose', async () => storage.close());
    if (queue) {
        app.addHook('onReady', async () => queue.ready());
        app.addHook('onClose', async () => queue.close());
    }
    const uploads =
        uploadService ??
        (database?.client && storage && queue
            ? createUploadModule({ client: database.client, storage, queue, config: uploadConfig }).service
            : undefined);
    const mediaList =
        mediaListService ??
        (database?.client && storage
            ? createMediaListModule({ client: database.client, storage, config: mediaListConfig }).service
            : undefined);
    const mediaDetail =
        mediaDetailService ??
        (database?.client && storage
            ? createMediaDetailModule({ client: database.client, storage, config: mediaDetailConfig }).service
            : undefined);
    const albums =
        albumService ??
        (database?.client
            ? createAlbumModule({ client: database.client, storage, config: mediaListConfig }).service
            : undefined);
    const taxonomy =
        taxonomyService ?? (database?.client ? createTaxonomyModule({ client: database.client }).service : undefined);
    const dashboard =
        dashboardService ??
        (database?.client
            ? createDashboardModule({ client: database.client, storage, config: mediaListConfig }).service
            : undefined);
    const mediaFavorite =
        mediaFavoriteService ??
        (database?.client ? createMediaFavoriteModule({ client: database.client }).service : undefined);
    const mediaTrash =
        mediaTrashService ??
        (database?.client
            ? createMediaTrashModule({ client: database.client, storage, config: mediaListConfig }).service
            : undefined);
    const imageOptimizationSettings =
        imageOptimizationSettingsService ??
        (database?.client ? createSettingsModule(database.client).imageOptimizationSettingsService : undefined);
    const storageStatistics =
        storageStatisticsService ??
        (database?.client ? createStorageStatisticsModule({ client: database.client, storage }).service : undefined);
    const semanticSearch =
        semanticSearchService ??
        (semanticProviders && database?.client
            ? createSemanticSearchModule({ client: database.client, ...semanticProviders }).service
            : undefined);
    if (semanticProviders && !semanticSearch) throw new Error('Semantic search requires a database');
    registerPlugins(app, config, {
        semanticSearchService: semanticSearch,
        authService: authentication,
        authConfig,
        storageStatisticsService: storageStatistics,
        imageOptimizationSettingsService: imageOptimizationSettings,
        dashboardService: dashboard,
        taxonomyService: taxonomy,
        albumService: albums,
        uploadService: uploads,
        mediaListService: mediaList,
        mediaDetailService: mediaDetail,
        mediaFavoriteService: mediaFavorite,
        mediaTrashService: mediaTrash,
    });
    return app;
}
