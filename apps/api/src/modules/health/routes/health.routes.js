import { createHealthController } from '../controllers/health.controller.js';
import { healthResponseSchema } from '../validators/health.schema.js';

export default async function healthRoutes(app, { version }) {
    app.get(
        '/health',
        {
            schema: {
                querystring: { type: 'object', additionalProperties: false, properties: {} },
                response: { 200: healthResponseSchema },
            },
        },
        createHealthController({ version }),
    );
}
