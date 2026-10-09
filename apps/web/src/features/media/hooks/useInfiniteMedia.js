import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';
import { DEFAULT_MEDIA_PAGE_SIZE } from '../constants/mediaConstants.js';
import { flattenMediaPages } from '../utils/flattenMediaPages.js';

/** Filters mirror GET /media; cursors are hook-owned. */
export function useInfiniteMedia(filters = {}, { enabled = true } = {}) {
  if (Object.hasOwn(filters, 'cursor')) throw new TypeError('useInfiniteMedia owns the cursor.');
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null && value !== undefined),
  );
  params.limit ??= DEFAULT_MEDIA_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey: mediaQueryKeys.infinite('media', params),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => {
      const request = { ...params, cursor: pageParam };
      return mediaApi.list(request, { signal });
    },
    getNextPageParam: (page) => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
    enabled,
  });
  const items = useMemo(() => flattenMediaPages(query.data?.pages), [query.data?.pages]);
  return { ...query, items, nextCursor: query.data?.pages.at(-1)?.nextCursor };
}
