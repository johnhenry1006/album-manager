import { useQuery } from '@tanstack/react-query';

import { settingsApi } from '../api/settingsApi.js';
import { settingsQueryKeys } from '../api/settingsQueryKeys.js';
import { readImageOptimizationSettings } from '../utils/settingsResponse.js';

export function useImageOptimizationSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.imageOptimization(),
    queryFn: async ({ signal }) =>
      readImageOptimizationSettings(await settingsApi.imageOptimization({ signal })),
  });
}
