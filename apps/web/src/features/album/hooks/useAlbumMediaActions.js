import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

/** add accepts { mediaId, position? } (also repositions); remove accepts a media ID. */
export function useAlbumMediaActions(albumId) {
  const client = useQueryClient();
  const refresh = (mediaId) =>
    Promise.all([
      client.invalidateQueries({ queryKey: albumQueryKeys.lists() }),
      client.invalidateQueries({ queryKey: albumQueryKeys.detail(albumId) }),
      client.invalidateQueries({ queryKey: albumQueryKeys.media(albumId) }),
      client.invalidateQueries({ queryKey: mediaQueryKeys.lists() }),
      client.invalidateQueries({ queryKey: mediaQueryKeys.detail(mediaId) }),
    ]);
  const requireAlbum = () => {
    if (!albumId) throw new TypeError('Album membership actions require an album ID.');
  };
  const add = useMutation({
    mutationFn: (body) => {
      requireAlbum();
      return albumApi.addMedia(albumId, body);
    },
    onSuccess: (_data, { mediaId }) => refresh(mediaId),
  });
  const remove = useMutation({
    mutationFn: (mediaId) => {
      requireAlbum();
      return albumApi.removeMedia(albumId, mediaId);
    },
    onSuccess: (_data, mediaId) => refresh(mediaId),
  });
  // Global media metadata changes (such as favorites) can affect any cached album gallery.
  const refreshMedia = () =>
    client.invalidateQueries({ queryKey: albumQueryKeys.mediaCollections() });
  return { add, remove, refreshMedia };
}
