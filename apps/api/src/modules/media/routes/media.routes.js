import { createMediaListController } from '../controllers/mediaList.controller.js';

export default async function mediaRoutes(app, { service }) {
    const controller = createMediaListController(service);
    app.get('/media', controller.list);
}
