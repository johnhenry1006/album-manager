import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { tagApi } from '../api/tagApi.js';

/** Additive assignments: pass { mediaId, tagIds } or { mediaIds, tagIds }. */
export function useAssignMediaTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, mediaIds, tagIds }) => {
      if ((mediaId !== undefined) === (mediaIds !== undefined)) {
        throw new TypeError('Provide either mediaId or mediaIds.');
      }
      return mediaIds !== undefined
        ? tagApi.assignToManyMedia(mediaIds, tagIds)
        : tagApi.assignToMedia(mediaId, tagIds);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
  });
}
