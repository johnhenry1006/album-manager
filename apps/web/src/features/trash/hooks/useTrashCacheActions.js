import { useQueryClient } from '@tanstack/react-query';

import { albumQueryKeys } from '@/features/album/index.js';
import { mediaQueryKeys, removeMediaDetail } from '@/features/media/index.js';

import { trashQueryKeys } from '../api/trashQueryKeys.js';

/** Restoring and purging affect both library items and album counts/covers. */
export function useTrashCacheActions() {
  const client = useQueryClient();
  return {
    refresh: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: trashQueryKeys.all }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
        client.invalidateQueries({ queryKey: albumQueryKeys.all }),
      ]),
    removeDetail: (mediaId) => removeMediaDetail(client, mediaId),
  };
}
