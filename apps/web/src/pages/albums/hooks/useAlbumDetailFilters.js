import { useSearchParams } from 'react-router';

import { useDebounce } from '@/hooks/useDebounce.js';

const NAMES = ['q', 'type', 'favorite'];
export function useAlbumDetailFilters() {
  const [params, setParams] = useSearchParams();
  const filters = {
    q: (params.get('q') || '').replace(/[\r\n\0]/g, '').slice(0, 255),
    type: ['IMAGE', 'VIDEO'].includes(params.get('type')) ? params.get('type') : '',
    favorite: ['true', 'false'].includes(params.get('favorite')) ? params.get('favorite') : '',
  };
  const search = filters.q.trim();
  const debounced = useDebounce(search);
  const apiFilters = {};
  if (debounced) apiFilters.q = debounced;
  if (filters.type) apiFilters.type = filters.type;
  if (filters.favorite) apiFilters.favorite = filters.favorite === 'true';
  function setFilter(name, value) {
    if (!NAMES.includes(name)) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: name === 'q' },
    );
  }
  function resetFilters() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      NAMES.forEach((name) => next.delete(name));
      return next;
    });
  }
  return { filters, apiFilters, setFilter, resetFilters, isSearchPending: search !== debounced };
}
