import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useIdSelection } from './useIdSelection.js';

it('deduplicates IDs and preserves selection and action identity across rerenders', () => {
  const { result, rerender } = renderHook(() => useIdSelection(['a', 'a']));
  const select = result.current.select;
  act(() => result.current.selectAll(['b', 'a', 'c']));
  rerender();
  expect(result.current.selectedIds).toEqual(['a', 'b', 'c']);
  expect(result.current.selectedCount).toBe(3);
  expect(result.current.select).toBe(select);
  expect(result.current.isSelected('b')).toBe(true);
});

it('supports toggling, deselection, failed-ID reconciliation and clearing', () => {
  const { result } = renderHook(() => useIdSelection(['a', 'b']));
  act(() => result.current.toggle('a'));
  act(() => result.current.toggle('c'));
  act(() => result.current.deselect('b'));
  act(() => result.current.select('d'));
  act(() => result.current.retainSelection(['d', 'missing']));
  expect(result.current.selectedIds).toEqual(['d']);
  expect(result.current.isSelected('c')).toBe(false);
  act(() => result.current.clearSelection());
  expect(result.current.selectedCount).toBe(0);
});
