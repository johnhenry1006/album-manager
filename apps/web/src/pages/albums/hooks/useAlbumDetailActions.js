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
  async function run(ids, action, onSuccess, label, refresh = false) {
    if (lock.current || !ids.length) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let completed = 0;
    const failures = [];
    try {
      for (const id of [...ids]) {
        try {
          await action(id);
          completed++;
          onSuccess?.(id);
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (refresh && completed) await membership.refreshMedia();
      setNotice(
        `${label}: ${completed} succeeded${failures.length ? `, ${failures.length} failed` : ''}.`,
      );
      if (failures.length) setError(failures[0].message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    isBusy,
    error,
    notice,
    removeSelected: () => {
      if (
        lock.current ||
        !selection.selectedCount ||
        !window.confirm(`Remove ${selection.selectedCount} selected media from this album?`)
      )
        return;
      return run(
        selection.selectedIds,
        membership.remove.mutateAsync,
        selection.deselect,
        'Remove from album',
      );
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
