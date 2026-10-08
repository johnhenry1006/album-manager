import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';

export function useMediaActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: mediaQueryKeys.all });
  async function removeDetail(mediaId) {
    const queryKey = mediaQueryKeys.detail(mediaId);
    await client.cancelQueries({ queryKey, exact: true });
    // Notify mounted observers before removal; active queries then refetch to a 404.
    client.setQueryData(queryKey, null);
    client.removeQueries({ queryKey, exact: true, type: 'inactive' });
  }
  const trash = useMutation({
    mutationFn: mediaApi.trash,
    onSuccess: async (_data, mediaId) => {
      await removeDetail(mediaId);
      await refresh();
    },
  });
  const restore = useMutation({ mutationFn: mediaApi.restore, onSuccess: refresh });
  const permanentDelete = useMutation({
    mutationFn: ({ mediaId, confirm } = {}) => {
      if (confirm !== true)
        throw new TypeError('Permanent deletion requires explicit confirmation.');
      return mediaApi.permanentDelete(mediaId, confirm);
    },
    onSuccess: (_data, { mediaId }) => removeDetail(mediaId),
    // A failed purge can still mark the item as unrestoreable on the server.
    onSettled: refresh,
  });
  return { trash, restore, permanentDelete };
}
