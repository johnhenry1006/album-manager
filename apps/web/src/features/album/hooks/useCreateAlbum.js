import { useMutation, useQueryClient } from '@tanstack/react-query';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

/** Pass album metadata directly to mutate/mutateAsync. */
export function useCreateAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: albumApi.create,
    onSuccess: () => client.invalidateQueries({ queryKey: albumQueryKeys.lists() }),
  });
}
