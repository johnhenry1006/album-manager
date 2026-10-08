import { createAlbumRepository } from './repositories/album.repository.js';
import { createAlbumService } from './services/album.service.js';

export function createAlbumModule({ client, storage, config }) {
    return Object.freeze({
        service: createAlbumService({ repository: createAlbumRepository(client), storage, config }),
    });
}

export { default as albumRoutes } from './routes/album.routes.js';
