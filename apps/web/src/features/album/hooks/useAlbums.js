import { useQuery } from '@tanstack/react-query';

import { withPaginationDefaults } from '@/utils/withPaginationDefaults.js';

import { albumApi } from '../api/albumApi.js';
import { albumQueryKeys } from '../api/albumQueryKeys.js';
import { DEFAULT_ALBUM_PAGE_SIZE } from '../constants/albumConstants.js';

/** Returns the API envelope; consumers control page, limit, and q. */
export function useAlbums(filters = {}, { enabled = true } = {}) {
  const params = withPaginationDefaults(filters, DEFAULT_ALBUM_PAGE_SIZE);
  return useQuery({
    queryKey: albumQueryKeys.list(params),
    queryFn: ({ signal }) => albumApi.list(params, { signal }),
    enabled,
  });
}
