import { validateQuery } from '#shared/validation/entityInput.js';

import { createAlbumController } from '../controllers/album.controller.js';

export default async function albumRoutes(app, { service }) {
    app.addHook('preValidation', async (request) => {
        if (request.method !== 'GET') validateQuery(request.query, []);
        if (request.method === 'DELETE' && request.body !== undefined)
            throw Object.assign(new Error('Unexpected body'), { statusCode: 400 });
    });
    const controller = createAlbumController(service);
    app.get('/albums', controller.list);
    app.post('/albums', controller.create);
    app.get(
        '/albums/:albumId',
        { preValidation: async (request) => validateQuery(request.query, []) },
        controller.detail,
    );
    app.patch('/albums/:albumId', controller.update);
    app.delete('/albums/:albumId', controller.remove);
    app.get('/albums/:albumId/media', controller.listMedia);
    app.post('/albums/:albumId/media', controller.addMedia);
    app.delete('/albums/:albumId/media/:mediaId', controller.removeMedia);
}
