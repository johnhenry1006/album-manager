import Fastify from 'fastify';

import { validateEnvironment } from '#config/environment.js';
import { validateMediaListEnvironment } from '#config/mediaList.js';
import { validateUploadEnvironment } from '#config/uploads.js';
import { createMediaListModule } from '#modules/media/index.js';
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
    mediaListService,
    mediaListConfig = validateMediaListEnvironment({}),
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
    registerPlugins(app, config, { uploadService: uploads, mediaListService: mediaList });
    return app;
}
