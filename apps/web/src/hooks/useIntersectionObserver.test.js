import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useIntersectionObserver } from './useIntersectionObserver.js';

afterEach(() => vi.unstubAllGlobals());

it('observes callback-ref targets, reports entries, and disconnects on replacement and unmount', () => {
  const observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  const { result, rerender, unmount } = renderHook(
    ({ threshold }) => useIntersectionObserver({ threshold }),
    {
      initialProps: { threshold: 0.5 },
    },
  );
  expect(result.current.entry).toBeNull();
  expect(result.current.isIntersecting).toBe(false);
  const target = document.createElement('div');
  act(() => result.current.ref(target));
  expect(observers[0].observe).toHaveBeenCalledWith(target);
  expect(observers[0].options.threshold).toBe(0.5);
  const entry = { target, isIntersecting: true, intersectionRatio: 0.75 };
  act(() => observers[0].callback([entry]));
  expect(result.current.entry).toBe(entry);
  expect(result.current.isIntersecting).toBe(true);
  rerender({ threshold: 1 });
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(observers[1].options.threshold).toBe(1);
  expect(result.current.entry).toBeNull();
  act(() => result.current.ref(document.createElement('div')));
  expect(observers[1].disconnect).toHaveBeenCalledOnce();
  act(() => observers[0].callback([entry]));
  expect(result.current.isIntersecting).toBe(false);
  unmount();
  expect(observers[2].disconnect).toHaveBeenCalledOnce();
});

it('handles missing IntersectionObserver and a detached target', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const { result } = renderHook(() => useIntersectionObserver());
  act(() => result.current.ref(document.createElement('div')));
  expect(result.current.entry).toBeNull();
  act(() => result.current.ref(null));
  expect(result.current.isIntersecting).toBe(false);
});
