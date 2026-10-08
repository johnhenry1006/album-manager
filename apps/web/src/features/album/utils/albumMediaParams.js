import { DEFAULT_ALBUM_MEDIA_PAGE_SIZE } from '../constants/albumConstants.js';

/** Gallery filters are deliberately narrower than library filters. Cursors are hook-owned. */
export function albumMediaParams(filters) {
  if (Object.keys(filters).some((key) => !['limit', 'q', 'type', 'favorite'].includes(key))) {
    throw new TypeError('Unsupported album media filter; useInfiniteAlbumMedia owns the cursor.');
  }
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== null && value !== undefined),
  );
  return { limit: DEFAULT_ALBUM_MEDIA_PAGE_SIZE, ...params };
}
