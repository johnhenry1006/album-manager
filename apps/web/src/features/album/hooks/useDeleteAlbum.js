import { useMutation, useQueryClient } from '@tanstack/react-query';

import { mediaQueryKeys } from '@/features/media/index.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';

/** Soft-delete an album by ID. Media and stored files are preserved. */
export function useDeleteAlbum() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: albumApi.delete,
    onSuccess: async (_data, id) => {
      const detail = { queryKey: albumQueryKeys.detail(id), exact: true };
      const media = { queryKey: albumQueryKeys.media(id) };
      await Promise.all([client.cancelQueries(detail), client.cancelQueries(media)]);
      // Clear mounted consumers before refetching the deleted resource.
      client.setQueryData(detail.queryKey, null);
      client.setQueriesData(media, { pages: [], pageParams: [] });
      client.removeQueries({ ...detail, type: 'inactive' });
      client.removeQueries({ ...media, type: 'inactive' });
      await Promise.all([
        client.invalidateQueries({ queryKey: albumQueryKeys.lists() }),
        client.invalidateQueries(detail),
        client.invalidateQueries(media),
        client.invalidateQueries({ queryKey: mediaQueryKeys.all }),
      ]);
    },
  });
}
