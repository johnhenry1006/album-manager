import { useInfiniteQuery } from '@tanstack/react-query';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';
import { DEFAULT_MEDIA_PAGE_SIZE } from '../constants/mediaConstants.js';

/** Filters mirror GET /media. Trash accepts only limit; cursors are hook-owned. */
export function useInfiniteMedia(filters = {}, { collection = 'media', enabled = true } = {}) {
  if (!['media', 'trash'].includes(collection)) throw new TypeError('Unknown media collection.');
  if (Object.hasOwn(filters, 'cursor')) throw new TypeError('useInfiniteMedia owns the cursor.');
  if (collection === 'trash' && Object.keys(filters).some((key) => key !== 'limit')) {
    throw new TypeError('Trash only supports the limit filter.');
  }
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null && value !== undefined),
  );
  params.limit ??= DEFAULT_MEDIA_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey: mediaQueryKeys.infinite(collection, params),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) => {
      const request = { ...params, cursor: pageParam };
      return collection === 'trash'
        ? mediaApi.listTrash(request, { signal })
        : mediaApi.list(request, { signal });
    },
    getNextPageParam: (page) => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
    enabled,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] };
}
