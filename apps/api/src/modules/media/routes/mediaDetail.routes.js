import { createMediaDetailController } from '../controllers/mediaDetail.controller.js';

export default async function mediaDetailRoutes(app, { service }) {
    const controller = createMediaDetailController(service);
    const options = {
        onRequest: async (_request, reply) => {
            reply.header('Cache-Control', 'no-store');
        },
    };
    app.get('/media/:mediaId', options, controller.detail);
    app.get('/media/:mediaId/original-url', options, controller.originalUrl);
}
