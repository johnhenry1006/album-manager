import { useQuery } from '@tanstack/react-query';

import { withPaginationDefaults } from '@/utils/withPaginationDefaults.js';

import { tagApi } from '../api/tagApi.js';
import { tagQueryKeys } from '../api/tagQueryKeys.js';
import { DEFAULT_TAG_PAGE_SIZE } from '../constants/tagConstants.js';

/** Returns the API envelope and query status; pagination stays consumer-controlled. */
export function useTags(filters = {}, { enabled = true } = {}) {
  if (Object.hasOwn(filters, 'tree')) throw new TypeError('Tags do not support tree queries.');
  const params = withPaginationDefaults(filters, DEFAULT_TAG_PAGE_SIZE);
  return useQuery({
    queryKey: tagQueryKeys.list(params),
    queryFn: ({ signal }) => tagApi.list(params, { signal }),
    enabled,
  });
}
