import { useQuery } from '@tanstack/react-query';

import { settingsApi } from '../api/settingsApi.js';
import { settingsQueryKeys } from '../api/settingsQueryKeys.js';
import { readStorageSettings } from '../utils/settingsResponse.js';

export function useStorageSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.storage(),
    queryFn: async ({ signal }) => readStorageSettings(await settingsApi.storage({ signal })),
  });
}
