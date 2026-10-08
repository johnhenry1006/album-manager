import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { tagApi } from '../api/tagApi.js';
import { tagQueryKeys } from '../api/tagQueryKeys.js';

/** Pass { id, ...metadata } to mutate/mutateAsync. */
export function useUpdateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => tagApi.update(id, body),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: tagQueryKeys.all }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]),
  });
}
