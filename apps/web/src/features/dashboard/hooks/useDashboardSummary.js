import { useQuery } from '@tanstack/react-query';

import { dashboardApi } from '../api/dashboardApi.js';
import { dashboardQueryKeys } from '../api/dashboardQueryKeys.js';

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardQueryKeys.summary(),
    queryFn: ({ signal }) => dashboardApi.summary({ signal }),
  });
}
