import { mapDashboard } from '../mappers/dashboard.mapper.js';
import { createDashboardSummaryReader } from './dashboardSummary.service.js';

export function createDashboardService({
    repository,
    now,
    summaryReader = createDashboardSummaryReader({ repository, now }),
}) {
    return Object.freeze({
        async summary() {
            const [summary, albums, media] = await Promise.all([
                summaryReader(),
                repository.recentAlbums(),
                repository.recentMedia(),
            ]);
            return mapDashboard(summary, albums, media);
        },
    });
}
