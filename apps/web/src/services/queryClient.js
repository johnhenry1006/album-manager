import { QueryClient } from '@tanstack/react-query';

/**
 * Data stays fresh for 30 seconds; inactive queries are retained for 5 minutes.
 * Retries are opt-in per feature hook, including mutations. Stale queries still
 * refetch on mount/reconnect, but window focus does not trigger a request.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
