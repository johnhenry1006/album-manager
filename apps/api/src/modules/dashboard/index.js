import { createDashboardRepository } from './repositories/dashboard.repository.js';
import { createDashboardService } from './services/dashboard.service.js';

export function createDashboardModule({ client, storage, config, summaryReader }) {
    return Object.freeze({
        service: createDashboardService({
            repository: createDashboardRepository(client),
            storage,
            config,
            summaryReader,
        }),
    });
}

export { default as dashboardRoutes } from './routes/dashboard.routes.js';
