import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { useCategories } from '@/features/category/index.js';
import { useInfiniteMedia } from '@/features/media/index.js';
import { useTags } from '@/features/tag/index.js';

import { useMediaLibraryFilters } from './useMediaLibraryFilters.js';

export function useMediaLibraryPage() {
  const filterState = useMediaLibraryFilters();
  const [categoryPage, setCategoryPage] = useState(1);
  const [tagPage, setTagPage] = useState(1);
  const categories = useCategories({ page: categoryPage });
  const tags = useTags({ page: tagPage });
  const media = useInfiniteMedia(filterState.apiFilters, { enabled: !filterState.dateError });
  const navigate = useNavigate();
  const openMedia = useCallback(
    (item) => navigate(`/media/${encodeURIComponent(item.id)}`),
    [navigate],
  );
  const retryMedia = () => (media.isFetchNextPageError ? media.fetchNextPage() : media.refetch());
  return {
    ...filterState,
    categories: { query: categories, page: categoryPage, setPage: setCategoryPage },
    tags: { query: tags, page: tagPage, setPage: setTagPage },
    mediaError: media.error,
    isFetchingMedia: media.isFetching,
    retryMedia,
    loadedCount: media.items.length,
    gridProps: {
      items: media.items,
      isLoading: media.isPending,
      isRefreshing: media.isFetching && !media.isFetchingNextPage,
      hasNextPage: media.hasNextPage && !media.isError && !filterState.isSearchPending,
      isFetchingNextPage: media.isFetchingNextPage,
      onLoadMore: media.fetchNextPage,
      nextCursor: media.nextCursor,
      paginationKey: JSON.stringify(filterState.apiFilters),
      onActivate: openMedia,
    },
  };
}
