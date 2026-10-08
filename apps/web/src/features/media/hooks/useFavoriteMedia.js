import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaApi } from '../api/mediaApi.js';
import { mediaQueryKeys } from '../api/mediaQueryKeys.js';

/** Explicit add/remove operations avoid toggling stale favorite values. */
export function useFavoriteMedia() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: mediaQueryKeys.all });
  const favorite = useMutation({ mutationFn: mediaApi.favorite, onSuccess: refresh });
  const unfavorite = useMutation({ mutationFn: mediaApi.unfavorite, onSuccess: refresh });
  return { favorite, unfavorite };
}
