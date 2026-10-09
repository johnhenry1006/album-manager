import { expect, it } from 'vitest';

import { flattenMediaPages } from './flattenMediaPages.js';
import { getMediaGridLayout, getMediaRowCount, getMediaRowItems } from './mediaGrid.js';

it.each([
  [0, 1, 0],
  [1, 3, 1],
  [6, 3, 2],
  [7, 3, 3],
  [10000, 4, 2500],
])('maps %i items in %i columns to %i rows', (items, columns, rows) => {
  expect(getMediaRowCount(items, columns)).toBe(rows);
});

it('maps row indices to bounded slices including the partial last row', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
  expect(getMediaRowItems(items, 0, 3).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  expect(getMediaRowItems(items, 1, 3).map(({ id }) => id)).toEqual(['d', 'e', 'f']);
  expect(getMediaRowItems(items, 2, 3).map(({ id }) => id)).toEqual(['g']);
  expect(getMediaRowItems(items, 3, 3)).toEqual([]);
  expect(getMediaRowItems(items, 0, 3)[0]).toBe(items[0]);
});

it('calculates responsive columns, exact card width and controlled row height', () => {
  expect(getMediaGridLayout(620, { minColumnWidth: 200, gap: 10, aspectRatio: 2 })).toEqual({
    columnCount: 3,
    cardWidth: 200,
    rowHeight: 100,
  });
  expect(
    getMediaGridLayout(619, { minColumnWidth: 200, gap: 10, aspectRatio: 1 }).columnCount,
  ).toBe(2);
  expect(getMediaGridLayout(100, { minColumnWidth: 200, gap: 10, aspectRatio: 2 })).toEqual({
    columnCount: 1,
    cardWidth: 100,
    rowHeight: 50,
  });
});

it('rejects invalid geometry rather than creating unbounded rows', () => {
  expect(() => getMediaRowCount(10, 0)).toThrow();
  expect(() => getMediaGridLayout(500, { minColumnWidth: 0 })).toThrow();
  expect(() => getMediaGridLayout(500, { aspectRatio: 0 })).toThrow();
});

it('flattens cursor pages in order, keeps item references and removes overlap by ID', () => {
  const first = { id: 'a' };
  const second = { id: 'b' };
  const third = { id: 'c' };
  const pages = [
    { items: [first, second], nextCursor: 'next' },
    { items: [{ id: 'b' }, third], nextCursor: null },
  ];
  const items = flattenMediaPages(pages);
  expect(items.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  expect(items[0]).toBe(first);
  expect(items[2]).toBe(third);
  expect(pages[1].items).toHaveLength(2);
  expect(flattenMediaPages()).toEqual([]);
  expect(flattenMediaPages([{ items: [] }])).toEqual([]);
});

it('provides finite initial geometry before the container is measured', () => {
  expect(getMediaGridLayout(0, { minColumnWidth: 200, gap: 10, aspectRatio: 2 })).toEqual({
    columnCount: 1,
    cardWidth: 200,
    rowHeight: 100,
  });
});

it.each([180, 372, 564, 756])('fits complete columns including gaps at width %i', (width) => {
  const { columnCount, cardWidth, rowHeight } = getMediaGridLayout(width);
  expect(cardWidth).toBe(180);
  expect(rowHeight).toBe(180);
  expect(cardWidth * columnCount + 12 * (columnCount - 1)).toBe(width);
  if (columnCount > 1) expect(getMediaGridLayout(width - 0.01).columnCount).toBe(columnCount - 1);
});

it.each([-1, NaN, Infinity])('rejects invalid width %s', (width) => {
  expect(() => getMediaGridLayout(width)).toThrow(TypeError);
});

it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid counts/indices %s',
  (value) => {
    expect(() => getMediaRowCount(value, 3)).toThrow(TypeError);
    expect(() => getMediaRowItems([], value, 3)).toThrow(TypeError);
  },
);

it.each([0, -1, NaN, Infinity, 1.5])(
  'rejects invalid column counts %s in both row operations',
  (columns) => {
    expect(() => getMediaRowCount(10, columns)).toThrow(TypeError);
    expect(() => getMediaRowItems([], 0, columns)).toThrow(TypeError);
  },
);

it('slices a frozen collection without copying or changing its media objects', () => {
  const items = Object.freeze(Array.from({ length: 10000 }, (_, id) => Object.freeze({ id })));
  const row = getMediaRowItems(items, 2499, 4);
  expect(row).toHaveLength(4);
  expect(row[0]).toBe(items[9996]);
  expect(row[3]).toBe(items[9999]);
  expect(items).toHaveLength(10000);
});
