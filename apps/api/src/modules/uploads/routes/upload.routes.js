import { createUploadController } from '../controllers/upload.controller.js';
import {
    completionResponse,
    emptyBody,
    fileBody,
    fileParams,
    sessionParams,
    sessionQuery,
} from '../validators/upload.schema.js';

export default async function uploadRoutes(app, { service }) {
    const controller = createUploadController(service);
    const bodyLimit = 16 * 1024;
    const emptyRequest = async (request) => {
        request.body ??= {};
    };
    app.post(
        '/uploads/sessions',
        { bodyLimit, preValidation: emptyRequest, schema: { body: emptyBody } },
        controller.createSession,
    );
    app.post(
        '/uploads/sessions/:sessionId/files',
        { bodyLimit, schema: { params: sessionParams, body: fileBody } },
        controller.registerFile,
    );
    app.post(
        '/uploads/files/:uploadFileId/presign',
        { bodyLimit, preValidation: emptyRequest, schema: { params: fileParams, body: emptyBody } },
        controller.presign,
    );
    app.post(
        '/uploads/files/:uploadFileId/complete',
        {
            bodyLimit,
            preValidation: emptyRequest,
            schema: {
                params: fileParams,
                body: emptyBody,
                response: { 200: completionResponse, 202: completionResponse },
            },
        },
        controller.complete,
    );
    app.get(
        '/uploads/sessions/:sessionId',
        { schema: { params: sessionParams, querystring: sessionQuery } },
        controller.loadSession,
    );
}
