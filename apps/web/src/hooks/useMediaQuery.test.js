import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useMediaQuery } from './useMediaQuery.js';

afterEach(() => vi.unstubAllGlobals());

it('tracks matches and replaces the subscription when the query changes', () => {
  const lists = new Map();
  vi.stubGlobal('matchMedia', (query) => {
    if (!lists.has(query)) {
      const list = new EventTarget();
      list.matches = query === '(min-width: 600px)';
      list.removeEventListener = vi.fn(list.removeEventListener.bind(list));
      lists.set(query, list);
    }
    return lists.get(query);
  });
  const { result, rerender, unmount } = renderHook(({ query }) => useMediaQuery(query), {
    initialProps: { query: '(min-width: 600px)' },
  });
  expect(result.current).toBe(true);
  const first = lists.get('(min-width: 600px)');
  act(() => {
    first.matches = false;
    first.dispatchEvent(new Event('change'));
  });
  expect(result.current).toBe(false);
  rerender({ query: '(prefers-reduced-motion: reduce)' });
  expect(result.current).toBe(false);
  expect(first.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  const second = lists.get('(prefers-reduced-motion: reduce)');
  act(() => {
    second.matches = true;
    second.dispatchEvent(new Event('change'));
  });
  expect(result.current).toBe(true);
  unmount();
  expect(second.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

it('returns false if matchMedia is unavailable', () => {
  vi.stubGlobal('matchMedia', undefined);
  expect(renderHook(() => useMediaQuery('(min-width: 600px)')).result.current).toBe(false);
});
