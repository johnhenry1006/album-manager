import { createHealthController } from '../controllers/health.controller.js';
import { healthResponseSchema } from '../validators/health.schema.js';

export default async function healthRoutes(app, { version }) {
    app.get(
        '/health',
        {
            schema: { response: { 200: healthResponseSchema } },
        },
        createHealthController({ version }),
    );
}
