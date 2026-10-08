import { useMutation, useQueryClient } from '@tanstack/react-query';

import { categoryApi } from '../api/categoryApi.js';
import { categoryQueryKeys } from '../api/categoryQueryKeys.js';

/** Pass metadata directly to mutate/mutateAsync. */
export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: categoryApi.create,
    onSuccess: () => client.invalidateQueries({ queryKey: categoryQueryKeys.all }),
  });
}
