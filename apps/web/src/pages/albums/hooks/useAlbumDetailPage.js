import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAlbum, useInfiniteAlbumMedia } from '@/features/album/index.js';
import { useInfiniteMedia, useMediaSelection } from '@/features/media/index.js';
import { useDebounce } from '@/hooks/useDebounce.js';

import { useAlbumDetailActions } from './useAlbumDetailActions.js';
import { useAlbumDetailFilters } from './useAlbumDetailFilters.js';

export function useAlbumDetailPage(albumId) {
  const state = useAlbumDetailFilters();
  const album = useAlbum(albumId);
  const media = useInfiniteAlbumMedia(albumId, state.apiFilters, {
    enabled: Boolean(album.data) && !state.isSearchPending,
  });
  const selection = useMediaSelection();
  const addSelection = useMediaSelection();
  const [isAdding, setAdding] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const cleanAddSearch = addSearch
    .trim()
    .replace(/[\r\n\0]/g, '')
    .slice(0, 255);
  const debounced = useDebounce(cleanAddSearch);
  const pickerFilters = debounced ? { q: debounced } : {};
  const picker = useInfiniteMedia(pickerFilters, {
    enabled: isAdding && Boolean(album.data) && debounced === cleanAddSearch,
  });
  const actions = useAlbumDetailActions(albumId, selection, addSelection);
  const navigate = useNavigate();
  const openMedia = useCallback(
    (item) => navigate(`/media/${encodeURIComponent(item.id)}`),
    [navigate],
  );
  const toggleAddSelection = addSelection.toggle;
  const isBusy = actions.isBusy;
  const togglePickerMedia = useCallback(
    (item) => {
      if (!isBusy) toggleAddSelection(item.id);
    },
    [isBusy, toggleAddSelection],
  );
  function closePicker() {
    if (actions.isBusy) return;
    setAdding(false);
    addSelection.clearSelection();
    setAddSearch('');
  }
  const gridProps = {
    items: media.items,
    isLoading: media.isPending,
    isRefreshing: media.isFetching && !media.isFetchingNextPage,
    hasNextPage: media.hasNextPage && !media.isError && !state.isSearchPending && !actions.isBusy,
    isFetchingNextPage: media.isFetchingNextPage,
    onLoadMore: media.fetchNextPage,
    nextCursor: media.nextCursor,
    paginationKey: JSON.stringify([albumId, state.apiFilters]),
    onActivate: openMedia,
    isSelected: selection.isSelected,
    onToggleSelection: selection.toggle,
    selectionDisabled: actions.selectionLocked,
  };
  return {
    ...state,
    album,
    media,
    selection,
    actions,
    gridProps,
    coverMedia: media.items.find((item) => item.id === album.data?.coverMediaId),
    selectLoaded: () => selection.selectAll(media.items.map((item) => item.id)),
    retryMedia: () => (media.isFetchNextPageError ? media.fetchNextPage() : media.refetch()),
    pickerProps: {
      isAdding,
      open: () => setAdding(true),
      close: closePicker,
      search: addSearch,
      setSearch: setAddSearch,
      selection: addSelection,
      actions,
      error: picker.error,
      isFetching: picker.isFetching,
      isSearchPending: debounced !== cleanAddSearch,
      retry: () => (picker.isFetchNextPageError ? picker.fetchNextPage() : picker.refetch()),
      gridProps: {
        items: picker.items,
        isLoading: picker.isPending,
        isRefreshing: picker.isFetching && !picker.isFetchingNextPage,
        hasNextPage:
          picker.hasNextPage && !picker.isError && !actions.isBusy && debounced === cleanAddSearch,
        isFetchingNextPage: picker.isFetchingNextPage,
        onLoadMore: picker.fetchNextPage,
        nextCursor: picker.nextCursor,
        paginationKey: JSON.stringify(pickerFilters),
        onActivate: togglePickerMedia,
        isSelected: addSelection.isSelected,
        onToggleSelection: addSelection.toggle,
        selectionDisabled: actions.selectionLocked,
      },
    },
  };
}
