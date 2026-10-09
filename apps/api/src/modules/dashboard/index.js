import { createDashboardRepository } from './repositories/dashboard.repository.js';
import { createDashboardService } from './services/dashboard.service.js';

export function createDashboardModule({ client, summaryReader }) {
    return Object.freeze({
        service: createDashboardService({ repository: createDashboardRepository(client), summaryReader }),
    });
}

export { default as dashboardRoutes } from './routes/dashboard.routes.js';
