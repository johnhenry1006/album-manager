import { createApplicationSettingsRepository } from './repositories/applicationSettings.repository.js';
import { createStorageStatisticsRepository } from './repositories/storageStatistics.repository.js';
import { ImageOptimizationSettingsService } from './services/imageOptimizationSettings.service.js';
import { createStorageStatisticsService } from './services/storageStatistics.service.js';

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

export function createStorageStatisticsModule({ client, storage }) {
    return Object.freeze({
        service: createStorageStatisticsService({ repository: createStorageStatisticsRepository(client), storage }),
    });
}
export { createStorageStatisticsService };
export { default as storageSettingsRoutes } from './routes/storageSettings.routes.js';
