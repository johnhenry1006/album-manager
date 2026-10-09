import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { flattenMediaPages } from '@/features/media/index.js';

import { trashApi } from '../api/trashApi.js';
import { trashQueryKeys } from '../api/trashQueryKeys.js';

/** GET /trash supports only limit; the hook owns the opaque cursor. */
export function useInfiniteTrash(filters = {}, { enabled = true } = {}) {
  if (Object.keys(filters).some((key) => key !== 'limit')) {
    throw new TypeError('Trash only supports the limit filter; useInfiniteTrash owns the cursor.');
  }
  const params = { limit: filters.limit ?? 50 };
  const query = useInfiniteQuery({
    queryKey: trashQueryKeys.infinite(params),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => trashApi.list({ ...params, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
    enabled,
  });
  const items = useMemo(() => flattenMediaPages(query.data?.pages), [query.data?.pages]);
  return { ...query, items, nextCursor: query.data?.pages.at(-1)?.nextCursor };
}
