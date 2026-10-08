import { useQuery } from '@tanstack/react-query';

import { withPaginationDefaults } from '@/utils/withPaginationDefaults.js';

import { categoryApi } from '../api/categoryApi.js';
import { categoryQueryKeys } from '../api/categoryQueryKeys.js';
import { DEFAULT_CATEGORY_PAGE_SIZE } from '../constants/categoryConstants.js';

/** Returns the API envelope and query status; pagination stays consumer-controlled. */
export function useCategories(filters = {}, { enabled = true } = {}) {
  const { tree, ...listFilters } = filters;
  if (tree === true && Object.keys(listFilters).length > 0) {
    throw new TypeError('Category tree requests cannot include pagination or search filters.');
  }
  const params =
    tree === true
      ? { tree: true }
      : withPaginationDefaults(listFilters, DEFAULT_CATEGORY_PAGE_SIZE);
  return useQuery({
    queryKey: tree === true ? categoryQueryKeys.tree() : categoryQueryKeys.list(params),
    queryFn: ({ signal }) => categoryApi.list(params, { signal }),
    enabled,
  });
}
