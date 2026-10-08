import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { useAlbumDetailFilters } from './useAlbumDetailFilters.js';

afterEach(() => vi.useRealTimers());
function setup(path) {
  return renderHook(
    () => ({ ...useAlbumDetailFilters(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> },
  );
}
it('normalizes external URL filters and keeps false favorites in API parameters', () => {
  const { result } = setup('/albums/a?q=beach%00&type=IMAGE&favorite=false');
  expect(result.current.apiFilters).toEqual({ q: 'beach', type: 'IMAGE', favorite: false });
});
it('debounces search, clears only album filters, and restores state on browser back', () => {
  vi.useFakeTimers();
  const { result } = setup('/albums/a?keep=1&type=bad&favorite=invalid');
  expect(result.current.apiFilters).toEqual({});
  act(() => result.current.setFilter('q', ' cats & dogs '));
  expect(result.current.isSearchPending).toBe(true);
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.apiFilters.q).toBe('cats & dogs');
  act(() => result.current.setFilter('type', 'VIDEO'));
  act(() => result.current.navigate(-1));
  expect(result.current.filters.type).toBe('');
  act(() => result.current.resetFilters());
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.location.search).toBe('?keep=1');
});
