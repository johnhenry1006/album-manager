import { createMediaFavoriteController } from '../controllers/mediaFavorite.controller.js';

export default async function mediaFavoriteRoutes(app, { service }) {
    const controller = createMediaFavoriteController(service);
    app.post('/media/:mediaId/favorite', controller.add);
    app.delete('/media/:mediaId/favorite', controller.remove);
}
