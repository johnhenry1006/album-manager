import { useSearchParams } from 'react-router';

import { useDebounce } from '@/hooks/useDebounce.js';

const FILTER_NAMES = ['q', 'visibility', 'sort', 'limit', 'page', 'view'];
const cleanSearch = (value) => value.replace(/[\r\n\0]/g, '').slice(0, 255);

/** URL owns controls; only search is debounced. Presentation never reaches the API. */
export function useAlbumListFilters() {
  const [params, setParams] = useSearchParams();
  const limit =
    /^\d+$/.test(params.get('limit') || '') &&
    Number(params.get('limit')) >= 1 &&
    Number(params.get('limit')) <= 48
      ? Number(params.get('limit'))
      : 24;
  const rawPage = params.get('page') || '1';
  const page =
    /^\d+$/.test(rawPage) && Number(rawPage) > 0 && (Number(rawPage) - 1) * limit <= 2147483647
      ? Number(rawPage)
      : 1;
  const filters = {
    q: cleanSearch(params.get('q') || ''),
    visibility: ['PRIVATE', 'PUBLIC'].includes(params.get('visibility'))
      ? params.get('visibility')
      : '',
    sort: ['newest', 'oldest', 'name'].includes(params.get('sort')) ? params.get('sort') : 'newest',
    view: params.get('view') === 'list' ? 'list' : 'grid',
    page,
    limit,
  };
  const search = filters.q.trim();
  const debouncedSearch = useDebounce(search);
  const apiFilters = { page, limit, sort: filters.sort };
  if (debouncedSearch) apiFilters.q = debouncedSearch;
  if (filters.visibility) apiFilters.visibility = filters.visibility;
  function setFilter(name, value) {
    if (!FILTER_NAMES.includes(name)) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const normalized = name === 'q' ? cleanSearch(value) : String(value);
        if (normalized) next.set(name, normalized);
        else next.delete(name);
        if (!['page', 'view'].includes(name)) next.delete('page');
        return next;
      },
      { replace: name === 'q' },
    );
  }
  function resetFilters() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      ['q', 'visibility', 'sort', 'page'].forEach((name) => next.delete(name));
      return next;
    });
  }
  return {
    filters,
    apiFilters,
    setFilter,
    resetFilters,
    isSearchPending: search !== debouncedSearch,
  };
}
