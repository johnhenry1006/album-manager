import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { useFavoriteMedia, useMediaActions, useMediaOriginalUrl } from '@/features/media/index.js';

export function useMediaDetailActions(mediaId, media, { isRefreshing = false } = {}) {
  const { favorite, unfavorite } = useFavoriteMedia();
  const { trash } = useMediaActions();
  const original = useMediaOriginalUrl();
  const navigate = useNavigate();
  const currentId = useRef(mediaId);
  useEffect(() => {
    currentId.current = mediaId;
  }, [mediaId]);
  const forCurrentMedia = (mutation) => mutation.variables === mediaId;
  const isFavoritePending = [favorite, unfavorite].some(
    (mutation) => forCurrentMedia(mutation) && mutation.isPending,
  );
  const isTrashPending = forCurrentMedia(trash) && trash.isPending;
  const isOriginalPending = forCurrentMedia(original) && original.isPending;
  const isBusy = isFavoritePending || isTrashPending;
  const disabled = !media || isBusy || isRefreshing;
  const changeFavorite = () => {
    if (disabled) return;
    favorite.reset();
    unfavorite.reset();
    (media.favorite ? unfavorite : favorite).mutate(mediaId);
  };
  const moveToTrash = () => {
    if (disabled || !window.confirm(`Move ${media.originalFilename} to trash?`)) return;
    trash.mutate(mediaId, {
      onSuccess: () => {
        if (currentId.current === mediaId) navigate('/media', { replace: true });
      },
    });
  };
  const requestOriginal = () => {
    if (!media || isTrashPending || isOriginalPending) return;
    original.mutate(mediaId);
  };
  return {
    disabled,
    isFavoritePending,
    isTrashPending,
    changeFavorite,
    moveToTrash,
    favoriteError: [favorite, unfavorite].find(
      (mutation) => forCurrentMedia(mutation) && mutation.isError,
    )?.error,
    trashError: forCurrentMedia(trash) ? trash.error : null,
    original: {
      data: forCurrentMedia(original) ? original.data : null,
      error: forCurrentMedia(original) ? original.error : null,
      isPending: isOriginalPending,
      disabled: !media || isTrashPending || isOriginalPending,
      request: requestOriginal,
    },
  };
}
