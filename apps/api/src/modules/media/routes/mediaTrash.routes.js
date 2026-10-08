import { createMediaTrashController } from '../controllers/mediaTrash.controller.js';

export default async function mediaTrashRoutes(app, { service }) {
    const controller = createMediaTrashController(service);
    app.delete('/media/:mediaId', controller.softDelete);
    app.get(
        '/trash',
        {
            onRequest: async (_request, reply) => {
                reply.header('Cache-Control', 'no-store');
            },
        },
        controller.list,
    );
    app.post('/trash/:mediaId/restore', controller.restore);
    app.delete('/trash/:mediaId/permanent', controller.permanent);
}
