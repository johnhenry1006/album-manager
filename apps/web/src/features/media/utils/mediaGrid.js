function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be positive.`);
}

function validateColumns(columns) {
  if (!Number.isSafeInteger(columns) || columns < 1) throw new TypeError('Invalid column count.');
}

export function getMediaGridLayout(
  width,
  { minColumnWidth = 180, gap = 12, aspectRatio = 1 } = {},
) {
  positive(minColumnWidth, 'Minimum column width');
  positive(aspectRatio, 'Aspect ratio');
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(gap) || gap < 0) {
    throw new TypeError('Invalid grid geometry.');
  }
  const columnCount = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
  const cardWidth = width > 0 ? (width - gap * (columnCount - 1)) / columnCount : minColumnWidth;
  return { columnCount, cardWidth, rowHeight: cardWidth / aspectRatio };
}

export function getMediaRowCount(itemCount, columnCount) {
  validateColumns(columnCount);
  if (!Number.isSafeInteger(itemCount) || itemCount < 0) throw new TypeError('Invalid item count.');
  return Math.ceil(itemCount / columnCount);
}

/** Slice only a requested row; never build a full array of row/card objects. */
export function getMediaRowItems(items, rowIndex, columnCount) {
  validateColumns(columnCount);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw new TypeError('Invalid row index.');
  const start = rowIndex * columnCount;
  return items.slice(start, start + columnCount);
}
