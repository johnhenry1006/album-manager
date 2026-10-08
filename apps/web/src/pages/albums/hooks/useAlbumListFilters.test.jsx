import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { useAlbumListFilters } from './useAlbumListFilters.js';

afterEach(() => vi.useRealTimers());
function setup(path) {
  return renderHook(
    () => ({ ...useAlbumListFilters(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> },
  );
}
it('normalizes invalid URL input and keeps view out of API filters', () => {
  const { result } = setup(
    '/albums?page=999999999999&limit=999&sort=bad&visibility=bad&view=bad&q=a%00b',
  );
  expect(result.current.apiFilters).toEqual({ page: 1, limit: 24, sort: 'newest', q: 'ab' });
  expect(result.current.filters.view).toBe('grid');
});
it('debounces searches, resets pagination, and restores controls on browser back', () => {
  vi.useFakeTimers();
  const { result } = setup('/albums?page=3&visibility=PUBLIC');
  act(() => result.current.setFilter('q', 'cats'));
  expect(result.current.filters.page).toBe(1);
  expect(result.current.isSearchPending).toBe(true);
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.apiFilters.q).toBe('cats');
  act(() => result.current.setFilter('sort', 'name'));
  expect(result.current.apiFilters.sort).toBe('name');
  act(() => result.current.navigate(-1));
  expect(result.current.filters.sort).toBe('newest');
});
