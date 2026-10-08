import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useFavoriteMedia, useInfiniteMedia, useMediaSelection } from '@/features/media/index.js';

export function useFavoritesPage() {
  const media = useInfiniteMedia({ favorite: true });
  const selection = useMediaSelection();
  const { unfavorite } = useFavoriteMedia();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [isBusy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const openMedia = useCallback(
    (item) => navigate(`/media/${encodeURIComponent(item.id)}`),
    [navigate],
  );

  // Snapshot selected IDs; successful removals clear only their own selection.
  async function removeSelected() {
    if (lock.current || !selection.selectedCount) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    let completed = 0;
    const failures = [];
    try {
      for (const id of selection.selectedIds) {
        try {
          await unfavorite.mutateAsync(id);
          selection.deselect(id);
          completed++;
        } catch (error) {
          failures.push(error);
        }
      }
      setNotice(
        `Remove from favorites: ${completed} succeeded${failures.length ? `, ${failures.length} failed` : ''}.`,
      );
      if (failures.length) setActionError(failures[0].message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return {
    loadedCount: media.items.length,
    mediaError: media.error,
    actionError,
    notice,
    retryMedia: () => (media.isFetchNextPageError ? media.fetchNextPage() : media.refetch()),
    toolbarProps: {
      loadedCount: media.items.length,
      selectedCount: selection.selectedCount,
      isBusy,
      onSelectLoaded: () => {
        if (!lock.current) selection.selectAll(media.items.map((item) => item.id));
      },
      onClearSelection: () => {
        if (!lock.current) selection.clearSelection();
      },
      onRemoveSelected: removeSelected,
    },
    gridProps: {
      items: media.items,
      isLoading: media.isPending,
      hasNextPage: media.hasNextPage && !media.isError && !isBusy,
      isFetchingNextPage: media.isFetchingNextPage,
      onLoadMore: media.fetchNextPage,
      nextCursor: media.nextCursor,
      paginationKey: 'favorites',
      onActivate: openMedia,
      isSelected: selection.isSelected,
      onToggleSelection: selection.toggle,
      selectionDisabled: isBusy,
    },
  };
}
