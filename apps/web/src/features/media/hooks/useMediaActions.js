import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';
import { removeMediaDetail } from '../utils/removeMediaDetail.js';

export function useMediaActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: mediaQueryKeys.all });
  const trash = useMutation({
    mutationFn: mediaApi.trash,
    onSuccess: async (_data, mediaId) => {
      await removeMediaDetail(client, mediaId);
      // Moving media to trash affects the library, trash collection and album views.
      // Global invalidation keeps media independent of its consuming features.
      await client.invalidateQueries();
    },
  });
  return { trash, refresh };
}
