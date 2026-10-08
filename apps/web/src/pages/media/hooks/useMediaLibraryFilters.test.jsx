import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { useMediaLibraryFilters } from './useMediaLibraryFilters.js';

afterEach(() => vi.useRealTimers());

function setup(path) {
  return renderHook(
    () => ({ ...useMediaLibraryFilters(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> },
  );
}

it('restores URL filters and includes the whole final capture date in API parameters', () => {
  const { result } = setup(
    '/media?q=beach&type=IMAGE&category=c&tag=t&favorite=false&takenAtFrom=2026-01-01&takenAtTo=2026-01-02',
  );
  expect(result.current.apiFilters).toEqual({
    q: 'beach',
    type: 'IMAGE',
    category: 'c',
    tag: 't',
    favorite: false,
    takenAtFrom: '2026-01-01T00:00:00.000Z',
    takenAtTo: '2026-01-02T23:59:59.999Z',
  });
});

it('updates controls immediately but debounces the search request and preserves other URL parameters', () => {
  vi.useFakeTimers();
  const { result } = setup('/media?tag=t&view=grid');
  act(() => result.current.setFilter('q', 'cats'));
  expect(result.current.filters.q).toBe('cats');
  expect(result.current.apiFilters.q).toBeUndefined();
  act(() => result.current.setFilter('q', 'cats & dogs'));
  act(() => vi.advanceTimersByTime(299));
  expect(result.current.apiFilters.q).toBeUndefined();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.apiFilters.q).toBe('cats & dogs');
  expect(new URLSearchParams(result.current.location.search).get('view')).toBe('grid');
  expect(result.current.apiFilters.tag).toBe('t');
  act(() => result.current.resetFilters());
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.location.search).toBe('?view=grid');
  expect(result.current.apiFilters).toEqual({});
});

it('restores controls on browser back and does not forward invalid URL values', () => {
  const { result } = setup('/media?type=invalid&favorite=maybe&takenAtFrom=2026-02-30');
  expect(result.current.apiFilters).toEqual({});
  act(() => result.current.setFilter('type', 'VIDEO'));
  expect(result.current.apiFilters.type).toBe('VIDEO');
  act(() => result.current.navigate(-1));
  expect(result.current.filters.type).toBe('');
});

it('blocks reversed date ranges instead of sending an invalid request', () => {
  const { result } = setup('/media?takenAtFrom=2026-02-02&takenAtTo=2026-02-01');
  expect(result.current.dateError).toBeTruthy();
});
