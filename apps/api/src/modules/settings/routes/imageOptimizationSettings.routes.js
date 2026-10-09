import { createImageOptimizationSettingsController } from '../controllers/imageOptimizationSettings.controller.js';

export default async function imageOptimizationSettingsRoutes(app, { service }) {
    const controller = createImageOptimizationSettingsController(service);
    app.get('/settings/image-optimization', controller.get);
    app.patch('/settings/image-optimization', controller.patch);
}
