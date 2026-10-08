import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAlbums } from '@/features/album/index.js';
import { useCategories } from '@/features/category/index.js';
import { useInfiniteMedia, useMediaSelection } from '@/features/media/index.js';
import { useTags } from '@/features/tag/index.js';

import { useSearchFilters } from './useSearchFilters.js';

export function useSearchPage() {
  const state = useSearchFilters();
  const [albumPage, setAlbumPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [tagPage, setTagPage] = useState(1);
  const albums = useAlbums({ page: albumPage });
  const categories = useCategories({ page: categoryPage });
  const tags = useTags({ page: tagPage });
  const media = useInfiniteMedia(state.apiFilters, {
    enabled: !state.dateError && !state.mimeError && !state.isSearchPending,
  });
  const selection = useMediaSelection();
  const navigate = useNavigate();
  const openMedia = useCallback(
    (item) => navigate(`/media/${encodeURIComponent(item.id)}`),
    [navigate],
  );
  return {
    formProps: {
      filters: state.filters,
      setFilter: state.setFilter,
      resetFilters: state.resetFilters,
      dateError: state.dateError,
      mimeError: state.mimeError,
      albums: { query: albums, page: albumPage, setPage: setAlbumPage },
      categories: { query: categories, page: categoryPage, setPage: setCategoryPage },
      tags: { query: tags, page: tagPage, setPage: setTagPage },
    },
    toolbarProps: {
      loadedCount: media.items.length,
      selectedCount: selection.selectedCount,
      onSelectLoaded: () => selection.selectAll(media.items.map((item) => item.id)),
      onClearSelection: selection.clearSelection,
    },
    loadedCount: media.items.length,
    filterError: state.dateError || state.mimeError,
    isSearchPending: state.isSearchPending,
    mediaError: media.error,
    retryMedia: () => (media.isFetchNextPageError ? media.fetchNextPage() : media.refetch()),
    gridProps: {
      items: media.items,
      isLoading: media.isPending,
      hasNextPage: media.hasNextPage && !media.isError && !state.isSearchPending,
      isFetchingNextPage: media.isFetchingNextPage,
      onLoadMore: media.fetchNextPage,
      nextCursor: media.nextCursor,
      paginationKey: JSON.stringify(state.apiFilters),
      onActivate: openMedia,
      isSelected: selection.isSelected,
      onToggleSelection: selection.toggle,
    },
  };
}
