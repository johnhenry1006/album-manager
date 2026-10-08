import { createAlbumController } from '../controllers/album.controller.js';

export default async function albumRoutes(app, { service }) {
    const controller = createAlbumController(service);
    app.get('/albums', controller.list);
    app.post('/albums', controller.create);
    app.get('/albums/:albumId', controller.detail);
    app.patch('/albums/:albumId', controller.update);
    app.delete('/albums/:albumId', controller.remove);
    app.get('/albums/:albumId/media', controller.listMedia);
    app.post('/albums/:albumId/media', controller.addMedia);
    app.delete('/albums/:albumId/media/:mediaId', controller.removeMedia);
}
