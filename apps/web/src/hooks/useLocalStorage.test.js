import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useLocalStorage } from './useLocalStorage.js';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('reads JSON and persists values and functional updates across consumers', () => {
  window.localStorage.setItem('counter', '2');
  const first = renderHook(() => useLocalStorage('counter', 0));
  const second = renderHook(() => useLocalStorage('counter', 0));
  expect(first.result.current[0]).toBe(2);
  act(() => first.result.current[1](3));
  expect(window.localStorage.getItem('counter')).toBe('3');
  expect(second.result.current[0]).toBe(3);
  act(() => {
    first.result.current[1]((value) => value + 1);
    first.result.current[1]((value) => value + 1);
  });
  expect(first.result.current[0]).toBe(5);
  expect(second.result.current[0]).toBe(5);
});

it('uses the default for missing or malformed JSON without overwriting storage on mount', () => {
  window.localStorage.setItem('broken', '{');
  const { result, rerender } = renderHook(({ key }) => useLocalStorage(key, { enabled: true }), {
    initialProps: { key: 'broken' },
  });
  expect(result.current[0]).toEqual({ enabled: true });
  expect(window.localStorage.getItem('broken')).toBe('{');
  window.localStorage.setItem('next', 'null');
  rerender({ key: 'next' });
  expect(result.current[0]).toBeNull();
  act(() => result.current[1]({ enabled: false }));
  expect(window.localStorage.getItem('next')).toBe('{"enabled":false}');
  expect(window.localStorage.getItem('broken')).toBe('{');
});

it('responds to external storage changes and clear events and cleans up subscriptions', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const { result, unmount } = renderHook(() => useLocalStorage('preference', 'default'));
  act(() => {
    window.localStorage.setItem('preference', '"external"');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'preference', storageArea: window.localStorage }),
    );
  });
  expect(result.current[0]).toBe('external');
  act(() => {
    window.localStorage.clear();
    window.dispatchEvent(
      new StorageEvent('storage', { key: null, storageArea: window.localStorage }),
    );
  });
  expect(result.current[0]).toBe('default');
  unmount();
  expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
});

it('keeps in-memory updates working when storage is inaccessible', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  const { result } = renderHook(() => useLocalStorage('counter', 1));
  expect(result.current[0]).toBe(1);
  act(() => result.current[1]((value) => value + 1));
  expect(result.current[0]).toBe(2);
  act(() => result.current[1]((value) => value + 1));
  expect(result.current[0]).toBe(3);
});
