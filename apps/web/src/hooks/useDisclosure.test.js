import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useDisclosure } from './useDisclosure.js';

it('opens, closes, and toggles with stable callbacks', () => {
  const { result, rerender } = renderHook(() => useDisclosure());
  expect(result.current.isOpen).toBe(false);
  const { open, close, toggle } = result.current;
  act(open);
  expect(result.current.isOpen).toBe(true);
  act(close);
  expect(result.current.isOpen).toBe(false);
  act(() => {
    toggle();
    toggle();
  });
  expect(result.current.isOpen).toBe(false);
  act(toggle);
  expect(result.current.isOpen).toBe(true);
  rerender();
  expect(result.current.open).toBe(open);
  expect(result.current.close).toBe(close);
  expect(result.current.toggle).toBe(toggle);
});

it('supports an initially open disclosure', () => {
  const { result } = renderHook(() => useDisclosure(true));
  expect(result.current.isOpen).toBe(true);
});
