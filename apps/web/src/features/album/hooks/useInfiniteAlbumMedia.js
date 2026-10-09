import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { INFINITE_GALLERY_GC_TIME } from '@/services/queryClient.js';
import { flattenPaginatedItems } from '@/utils/flattenPaginatedItems.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';
import { albumMediaParams } from '../utils/albumMediaParams.js';

/** Server cursors preserve (position, membershipId) ordering; never decode them here. */
export function useInfiniteAlbumMedia(albumId, filters = {}, { enabled = true } = {}) {
  const params = albumMediaParams(filters);
  const query = useInfiniteQuery({
    gcTime: INFINITE_GALLERY_GC_TIME,
    queryKey: albumQueryKeys.infiniteMedia(albumId, params),
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      albumApi.listMedia(albumId, { ...params, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => (page.hasMore ? (page.nextCursor ?? undefined) : undefined),
    enabled: enabled && Boolean(albumId),
  });
  const items = useMemo(() => flattenPaginatedItems(query.data?.pages), [query.data?.pages]);
  return { ...query, items, nextCursor: query.data?.pages.at(-1)?.nextCursor };
}
