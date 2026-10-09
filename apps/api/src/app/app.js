import Fastify from 'fastify';

import { validateEnvironment } from '#config/environment.js';
import { validateMediaDetailEnvironment } from '#config/mediaDetail.js';
import { validateMediaListEnvironment } from '#config/mediaList.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createAlbumModule } from '#modules/albums/index.js';
import { createDashboardModule } from '#modules/dashboard/index.js';
import {
    createMediaDetailModule,
    createMediaFavoriteModule,
    createMediaListModule,
    createMediaTrashModule,
} from '#modules/media/index.js';
import { createSettingsModule, createStorageStatisticsModule } from '#modules/settings/index.js';
import { createTaxonomyModule } from '#modules/taxonomy/index.js';
import { createUploadModule } from '#modules/uploads/index.js';

import { registerPlugins } from './registerPlugins.js';

export function buildApp({
    config = validateEnvironment({}),
    logger,
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
    mediaListService,
    mediaListConfig = validateMediaListEnvironment({}),
    mediaDetailService,
    mediaFavoriteService,
    mediaTrashService,
    mediaDetailConfig = validateMediaDetailEnvironment({}),
} = {}) {
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
    registerPlugins(app, config, {
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
