import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { categoryApi } from '../api/categoryApi.js';
import { categoryQueryKeys } from '../api/categoryQueryKeys.js';

/** Pass { id, ...metadata } to mutate/mutateAsync. */
export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => categoryApi.update(id, body),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: categoryQueryKeys.all }),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]),
  });
}
