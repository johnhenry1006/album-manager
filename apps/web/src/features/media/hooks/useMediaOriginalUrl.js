import { useMutation } from '@tanstack/react-query';

import { ApiError } from '@/services/apiError.js';

import { mediaApi } from '../api/mediaApi.js';

/** On-demand signing only. Never fetched on mount or during detail/cache refreshes. */
export function useMediaOriginalUrl() {
  return useMutation({
    mutationFn: async (mediaId) => {
      const result = await mediaApi.originalUrl(mediaId);
      let url;
      try {
        url = new URL(result?.url);
      } catch {
        throw new ApiError('Invalid original media link.', { code: 'INVALID_RESPONSE' });
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new ApiError('Invalid original media link.', { code: 'INVALID_RESPONSE' });
      }
      return result;
    },
  });
}
