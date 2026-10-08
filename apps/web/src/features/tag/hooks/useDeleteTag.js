import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { tagApi } from '../api/tagApi.js';
import { tagQueryKeys } from '../api/tagQueryKeys.js';

/** Pass the taxonomy ID to mutate/mutateAsync. */
export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: tagApi.delete,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: tagQueryKeys.all }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]),
  });
}
