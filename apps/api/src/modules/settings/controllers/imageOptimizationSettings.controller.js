import { validateQuery } from '#shared/validation/entityInput.js';

import { mapImageOptimizationSettings } from '../mappers/imageOptimizationSettings.mapper.js';

export function createImageOptimizationSettingsController(service) {
    return {
        async get(request) {
            validateQuery(request.query, []);
            return mapImageOptimizationSettings(await service.getSettings());
        },
        async patch(request) {
            validateQuery(request.query, []);
            return mapImageOptimizationSettings(await service.patchSettings(request.body));
        },
    };
}
