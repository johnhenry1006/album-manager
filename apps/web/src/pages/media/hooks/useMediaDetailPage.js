import { useParams } from 'react-router';

import { useMedia, useMediaVariants } from '@/features/media/index.js';

import { useMediaDetailActions } from './useMediaDetailActions.js';

export function useMediaDetailPage() {
  const { mediaId } = useParams();
  const query = useMedia(mediaId);
  const variants = useMediaVariants(query.data, { allowThumbnailFallback: false });
  const actions = useMediaDetailActions(mediaId, query.data, { isRefreshing: query.isFetching });
  return {
    mediaId,
    media: query.data,
    isLoading: query.isPending || actions.isTrashPending,
    error: query.error,
    refresh: query.refetch,
    preview: variants.preview,
    actions,
  };
}
