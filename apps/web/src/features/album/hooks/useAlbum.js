import { useQuery } from '@tanstack/react-query';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

export function useAlbum(albumId, { enabled = true } = {}) {
  return useQuery({
    queryKey: albumQueryKeys.detail(albumId),
    queryFn: ({ signal }) => albumApi.detail(albumId, { signal }),
    enabled: enabled && Boolean(albumId),
  });
}
