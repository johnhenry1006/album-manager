import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { usePrevious } from './usePrevious.js';

it('returns the value from the previous committed render, including undefined', () => {
  const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
    initialProps: { value: 'first' },
  });
  expect(result.current).toBeUndefined();
  rerender({ value: 'second' });
  expect(result.current).toBe('first');
  rerender({ value: undefined });
  expect(result.current).toBe('second');
  rerender({ value: 'last' });
  expect(result.current).toBeUndefined();
});
