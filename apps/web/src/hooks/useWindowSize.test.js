import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWindowSize } from './useWindowSize.js';

afterEach(() => vi.restoreAllMocks());

it('reads the viewport, updates on resize, and removes its listener on unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const { result, unmount } = renderHook(() => useWindowSize());
  expect(result.current).toEqual({ width: window.innerWidth, height: window.innerHeight });
  const original = { width: window.innerWidth, height: window.innerHeight };
  try {
    act(() => {
      window.innerWidth = 640;
      window.innerHeight = 480;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ width: 640, height: 480 });
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  } finally {
    window.innerWidth = original.width;
    window.innerHeight = original.height;
  }
});
