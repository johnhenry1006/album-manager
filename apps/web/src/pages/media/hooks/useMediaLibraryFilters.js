import { useSearchParams } from 'react-router';

import { useDebounce } from '@/hooks/useDebounce.js';

const FILTER_NAMES = ['q', 'type', 'category', 'tag', 'takenAtFrom', 'takenAtTo', 'favorite'];

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

/** URL-owned page filters; only the API search value is debounced. Date bounds use UTC. */
export function useMediaLibraryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(
    FILTER_NAMES.map((name) => [name, searchParams.get(name) || '']),
  );
  filters.type = ['IMAGE', 'VIDEO'].includes(filters.type) ? filters.type : '';
  filters.favorite = ['true', 'false'].includes(filters.favorite) ? filters.favorite : '';
  filters.takenAtFrom = calendarDate(filters.takenAtFrom);
  filters.takenAtTo = calendarDate(filters.takenAtTo);
  filters.q = filters.q.replace(/[\r\n\0]/g, '').slice(0, 255);
  const search = filters.q.trim();
  const debouncedSearch = useDebounce(search);
  const dateError =
    filters.takenAtFrom && filters.takenAtTo && filters.takenAtFrom > filters.takenAtTo
      ? 'The capture date start must be on or before the end.'
      : '';
  const apiFilters = Object.fromEntries(
    ['type', 'category', 'tag']
      .filter((name) => filters[name])
      .map((name) => [name, filters[name]]),
  );
  if (debouncedSearch) apiFilters.q = debouncedSearch;
  if (filters.favorite) apiFilters.favorite = filters.favorite === 'true';
  if (filters.takenAtFrom) apiFilters.takenAtFrom = `${filters.takenAtFrom}T00:00:00.000Z`;
  if (filters.takenAtTo) apiFilters.takenAtTo = `${filters.takenAtTo}T23:59:59.999Z`;

  function setFilter(name, value) {
    if (!FILTER_NAMES.includes(name)) return;
    setSearchParams(
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
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      FILTER_NAMES.forEach((name) => next.delete(name));
      return next;
    });
  }
  return {
    filters,
    apiFilters,
    dateError,
    setFilter,
    resetFilters,
    isSearchPending: search !== debouncedSearch,
  };
}
