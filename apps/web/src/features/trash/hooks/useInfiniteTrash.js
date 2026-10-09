import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { INFINITE_GALLERY_GC_TIME } from '@/services/queryClient.js';
import { flattenPaginatedItems } from '@/utils/flattenPaginatedItems.js';

import { trashApi } from '../api/trashApi.js';
import { trashQueryKeys } from '../api/trashQueryKeys.js';

/** GET /trash supports only limit; the hook owns the opaque cursor. */
export function useInfiniteTrash(filters = {}, { enabled = true } = {}) {
  if (Object.keys(filters).some((key) => key !== 'limit')) {
    throw new TypeError('Trash only supports the limit filter; useInfiniteTrash owns the cursor.');
  }
  const params = { limit: filters.limit ?? 50 };
  const query = useInfiniteQuery({
    gcTime: INFINITE_GALLERY_GC_TIME,
    queryKey: trashQueryKeys.infinite(params),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => trashApi.list({ ...params, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
    enabled,
  });
  const items = useMemo(() => flattenPaginatedItems(query.data?.pages), [query.data?.pages]);
  return { ...query, items, nextCursor: query.data?.pages.at(-1)?.nextCursor };
}
