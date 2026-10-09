import { useMediaSelection } from '@/features/media/index.js';
import { useInfiniteTrash } from '@/features/trash/index.js';

import { useTrashActions } from './useTrashActions.js';

export function useTrashPage() {
  const media = useInfiniteTrash();
  const selection = useMediaSelection();
  const actions = useTrashActions(selection, media.items);
  return {
    loadedCount: media.items.length,
    mediaError: media.error,
    actionError: actions.error,
    notice: actions.notice,
    retryMedia: () => (media.isFetchNextPageError ? media.fetchNextPage() : media.refetch()),
    toolbarProps: {
      loadedCount: media.items.length,
      selectedCount: selection.selectedCount,
      isBusy: actions.isBusy,
      selectionLocked: actions.selectionLocked,
      restoreAllowed: actions.restoreAllowed,
      confirmationCount: actions.confirmationCount,
      onRestore: actions.restoreSelected,
      onRequestDelete: actions.requestPermanentDelete,
      onConfirmDelete: actions.confirmPermanentDelete,
      onCancelDelete: actions.cancelPermanentDelete,
      onSelectLoaded: () => {
        if (!actions.isLocked()) selection.selectAll(media.items.map(({ id }) => id));
      },
      onClearSelection: () => {
        if (!actions.isLocked()) selection.clearSelection();
      },
    },
    gridProps: {
      items: media.items,
      isLoading: media.isPending,
      hasNextPage: media.hasNextPage && !media.isError && !actions.selectionLocked,
      isFetchingNextPage: media.isFetchingNextPage,
      onLoadMore: media.fetchNextPage,
      nextCursor: media.nextCursor,
      paginationKey: 'trash',
      isSelected: selection.isSelected,
      onToggleSelection: (id) => {
        if (!actions.isLocked()) selection.toggle(id);
      },
      selectionDisabled: actions.selectionLocked,
    },
  };
}
