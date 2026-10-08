import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { categoryApi } from '../api/categoryApi.js';

/** Additive assignments: pass { mediaId, categoryIds } or { mediaIds, categoryIds }. */
export function useAssignMediaCategories() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, mediaIds, categoryIds }) => {
      if ((mediaId !== undefined) === (mediaIds !== undefined)) {
        throw new TypeError('Provide either mediaId or mediaIds.');
      }
      return mediaIds !== undefined
        ? categoryApi.assignToManyMedia(mediaIds, categoryIds)
        : categoryApi.assignToMedia(mediaId, categoryIds);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
  });
}
