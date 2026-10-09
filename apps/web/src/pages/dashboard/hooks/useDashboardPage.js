import { useDashboardSummary } from '@/features/dashboard/index.js';

export function useDashboardPage() {
  const query = useDashboardSummary();
  return {
    hasSummary: Boolean(query.data),
    counts: query.data?.counts,
    storage: query.data?.storage,
    recentAlbums: query.data?.recentAlbums ?? [],
    recentMedia: query.data?.recentMedia ?? [],
    summaryUpdatedAt: query.data?.summaryUpdatedAt,
    isLoading: query.isPending,
    isRefreshing: query.isFetching,
    error: query.error,
    refresh: () => {
      if (!query.isFetching) return query.refetch();
    },
  };
}
