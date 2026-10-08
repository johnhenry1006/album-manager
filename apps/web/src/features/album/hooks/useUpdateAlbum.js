import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

/** Pass { id, ...metadata }, including coverMediaId, to mutate/mutateAsync. */
export function useUpdateAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => albumApi.update(id, body),
    onSuccess: (_data, { id }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: albumQueryKeys.lists() }),
        client.invalidateQueries({ queryKey: albumQueryKeys.detail(id) }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]),
  });
}
