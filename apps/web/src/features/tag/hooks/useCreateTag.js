import { useMutation, useQueryClient } from '@tanstack/react-query';

import { tagApi } from '../api/tagApi.js';
import { tagQueryKeys } from '../api/tagQueryKeys.js';

/** Pass metadata directly to mutate/mutateAsync. */
export function useCreateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: tagApi.create,
    onSuccess: () => client.invalidateQueries({ queryKey: tagQueryKeys.all }),
  });
}
