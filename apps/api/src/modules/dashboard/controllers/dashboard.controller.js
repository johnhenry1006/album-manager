import { validateQuery } from '#shared/validation/entityInput.js';

export function createDashboardController(service) {
    return async function dashboardSummary(request) {
        validateQuery(request.query, []);
        return service.summary();
    };
}
