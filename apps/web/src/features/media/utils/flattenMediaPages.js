/** Cursor pages may overlap after library changes; keep one stable card per ID. */
export function flattenMediaPages(pages = []) {
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
