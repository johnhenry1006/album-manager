/** Cursor pages may overlap after collection changes; keep one stable item per ID. */
export function flattenPaginatedItems(pages = []) {
  const seen = new Set();
  const items = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return items;
}
