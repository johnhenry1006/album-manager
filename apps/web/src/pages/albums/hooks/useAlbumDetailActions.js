import { useRef, useState } from 'react';

import { useAlbumMediaActions, useUpdateAlbum } from '@/features/album/index.js';
import { useFavoriteMedia } from '@/features/media/index.js';

/** Compose feature mutations; preserve failed IDs so a partial operation can be retried. */
export function useAlbumDetailActions(albumId, selection, addSelection) {
  const membership = useAlbumMediaActions(albumId);
  const update = useUpdateAlbum();
  const favorites = useFavoriteMedia();
  const lock = useRef(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removalIds, setRemovalIds] = useState(null);
  async function run(ids, action, onSuccess, label, refresh = false) {
    if (lock.current || !ids.length || (removalIds && label !== 'Remove from album')) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let completed = 0;
    const failures = [];
    const failedIds = [];
    try {
      for (const id of [...ids]) {
        try {
          await action(id);
          completed++;
          onSuccess?.(id);
        } catch (failure) {
          failures.push(failure);
          failedIds.push(id);
        }
      }
      if (refresh && completed) await membership.refreshMedia();
      setNotice(
        `${label}: ${completed} succeeded${failures.length ? `, ${failures.length} failed` : ''}.`,
      );
      if (failures.length) setError(failures[0].message);
      return failedIds;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    isBusy,
    error,
    notice,
    selectionLocked: isBusy || Boolean(removalIds),
    removalConfirmation: {
      open: Boolean(removalIds),
      count: removalIds?.length ?? 0,
      isPending: isBusy,
      error,
      onCancel: () => {
        if (!lock.current) setRemovalIds(null);
      },
      onConfirm: async () => {
        if (lock.current || !removalIds) return;
        const failedIds = await run(
          removalIds,
          membership.remove.mutateAsync,
          selection.deselect,
          'Remove from album',
        );
        setRemovalIds(failedIds.length ? failedIds : null);
      },
    },
    removeSelected: () => {
      if (lock.current || removalIds || !selection.selectedCount) return;
      setError('');
      setRemovalIds([...selection.selectedIds]);
    },
    favoriteSelected: () =>
      run(
        selection.selectedIds,
        favorites.favorite.mutateAsync,
        selection.deselect,
        'Favorite media',
        true,
      ),
    setCover: () =>
      selection.selectedCount === 1
        ? run(
            selection.selectedIds,
            (id) => update.mutateAsync({ id: albumId, coverMediaId: id }),
            null,
            'Set cover',
          )
        : undefined,
    clearCover: () =>
      run(
        [albumId],
        () => update.mutateAsync({ id: albumId, coverMediaId: null }),
        null,
        'Clear cover',
      ),
    addSelected: () =>
      run(
        addSelection.selectedIds,
        (mediaId) => membership.add.mutateAsync({ mediaId }),
        addSelection.deselect,
        'Add media',
      ),
  };
}
