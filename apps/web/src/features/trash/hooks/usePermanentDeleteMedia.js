import { useMutation } from '@tanstack/react-query';

import { trashApi } from '../api/trashApi.js';
import { useTrashCacheActions } from './useTrashCacheActions.js';

export function usePermanentDeleteMedia() {
  const { refresh, removeDetail } = useTrashCacheActions();
  return useMutation({
    mutationFn: ({ mediaId, confirm } = {}) => {
      if (confirm !== true)
        throw new TypeError('Permanent deletion requires explicit confirmation.');
      return trashApi.permanentDelete(mediaId);
    },
    onSuccess: (_data, { mediaId }) => removeDetail(mediaId),
    // A failed purge may have made the media unrestoreable on the server.
    onSettled: refresh,
  });
}
