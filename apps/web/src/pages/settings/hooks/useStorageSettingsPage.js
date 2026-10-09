import { useStorageSettings } from '@/features/settings/index.js';

export function useStorageSettingsPage() {
  const query = useStorageSettings();
  return {
    storage: query.data,
    isLoading: query.isPending,
    isRefreshing: query.isFetching,
    error: query.error,
    refresh: () => {
      if (!query.isFetching) return query.refetch();
    },
  };
}
