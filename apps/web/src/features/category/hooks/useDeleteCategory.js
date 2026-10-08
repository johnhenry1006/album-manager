import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { categoryApi } from '../api/categoryApi.js';
import { categoryQueryKeys } from '../api/categoryQueryKeys.js';

/** Pass the taxonomy ID to mutate/mutateAsync. */
export function useDeleteCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: categoryApi.delete,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: categoryQueryKeys.all }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]),
  });
}
