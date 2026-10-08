import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

/** add accepts { mediaId, position?, albumId? }; an explicit albumId overrides the bound ID. remove accepts a media ID. */
export function useAlbumMediaActions(albumId) {
  const client = useQueryClient();
  const refresh = (mediaId, targetAlbumId = albumId) =>
    Promise.all([
      client.invalidateQueries({ queryKey: albumQueryKeys.lists() }),
      client.invalidateQueries({ queryKey: albumQueryKeys.detail(targetAlbumId) }),
      client.invalidateQueries({ queryKey: albumQueryKeys.media(targetAlbumId) }),
      client.invalidateQueries({ queryKey: mediaQueryKeys.lists() }),
      client.invalidateQueries({ queryKey: mediaQueryKeys.detail(mediaId) }),
    ]);
  const requireAlbum = () => {
    if (!albumId) throw new TypeError('Album membership actions require an album ID.');
  };
  const add = useMutation({
    mutationFn: ({ albumId: targetAlbumId = albumId, ...body }) => {
      if (!targetAlbumId) throw new TypeError('Album membership actions require an album ID.');
      return albumApi.addMedia(targetAlbumId, body);
    },
    onSuccess: (_data, { mediaId, albumId: targetAlbumId = albumId }) =>
      refresh(mediaId, targetAlbumId),
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
