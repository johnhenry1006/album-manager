import { useMutation, useQueryClient } from '@tanstack/react-query';

import { settingsApi } from '../api/settingsApi.js';
import { settingsQueryKeys } from '../api/settingsQueryKeys.js';
import { readImageOptimizationSettings } from '../utils/settingsResponse.js';

/** Pass a partial settings object to mutate/mutateAsync; the backend validates PATCH input. */
export function useUpdateImageOptimizationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      readImageOptimizationSettings(await settingsApi.updateImageOptimization(body)),
    onSuccess: async (settings) => {
      const queryKey = settingsQueryKeys.imageOptimization();
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, settings);
      return client.invalidateQueries({ queryKey, exact: true });
    },
  });
}
