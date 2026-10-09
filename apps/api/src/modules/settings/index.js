import { createApplicationSettingsRepository } from './repositories/applicationSettings.repository.js';
import { ImageOptimizationSettingsService } from './services/imageOptimizationSettings.service.js';

export function createSettingsModule(client) {
    return Object.freeze({
        imageOptimizationSettingsService: new ImageOptimizationSettingsService({
            repository: createApplicationSettingsRepository(client),
        }),
    });
}
export { ImageOptimizationSettingsService };
export { default as imageOptimizationSettingsRoutes } from './routes/imageOptimizationSettings.routes.js';
export {
    IMAGE_OPTIMIZATION_SETTINGS_KEY,
    ImageOptimizationSettingsError,
} from './services/imageOptimizationSettings.service.js';
