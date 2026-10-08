import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useDebounce } from './useDebounce.js';

afterEach(() => vi.useRealTimers());

it('returns the initial value and publishes only the latest value after the delay', () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(
    ({ value, delay }) => useDebounce(value, delay),
    {
      initialProps: { value: 'first', delay: 100 },
    },
  );
  expect(result.current).toBe('first');
  rerender({ value: 'second', delay: 100 });
  act(() => vi.advanceTimersByTime(50));
  rerender({ value: 'third', delay: 100 });
  act(() => vi.advanceTimersByTime(99));
  expect(result.current).toBe('first');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe('third');
  rerender({ value: 'fourth', delay: 20 });
  act(() => vi.advanceTimersByTime(20));
  expect(result.current).toBe('fourth');
  rerender({ value: 'pending', delay: 100 });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
