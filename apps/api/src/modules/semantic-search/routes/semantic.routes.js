import { createSemanticController } from '../controllers/semantic.controller.js';

export default async function semanticRoutes(app, { service }) {
    const controller = createSemanticController(service);
    app.post('/semantic-search', controller.text);
    app.get('/media/:mediaId/similar', controller.similar);
    app.get('/media/:mediaId/semantic-tags', controller.tags);
}
