import { useQuery } from '@tanstack/react-query';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';

/** Detail data only; galleries should use useInfiniteMedia instead. */
export function useMedia(mediaId, { enabled = true } = {}) {
  return useQuery({
    queryKey: mediaQueryKeys.detail(mediaId),
    queryFn: ({ signal }) => mediaApi.detail(mediaId, { signal }),
    enabled: enabled && Boolean(mediaId),
  });
}
