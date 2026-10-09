import { validateQuery } from '#shared/validation/entityInput.js';

export function createStorageSettingsController(service) {
    return {
        async get(request) {
            validateQuery(request.query, []);
            return service.getStatistics();
        },
    };
}
