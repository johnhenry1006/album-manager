import { expect, it } from 'vitest';

import { flattenPaginatedItems } from './flattenPaginatedItems.js';

it('deduplicates overlapping pages in first-occurrence order without copying items', () => {
  const first = { id: 'a', name: 'first' };
  const second = { id: 'b' };
  const items = flattenPaginatedItems([
    { items: [first, second] },
    { items: [{ id: 'a', name: 'later' }, { id: 'c' }] },
  ]);
  expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  expect(items[0]).toBe(first);
  expect(items[1]).toBe(second);
});

it('handles absent and empty pages', () => {
  expect(flattenPaginatedItems()).toEqual([]);
  expect(flattenPaginatedItems([{ items: [] }])).toEqual([]);
});
