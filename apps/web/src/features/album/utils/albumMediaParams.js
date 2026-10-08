import { DEFAULT_ALBUM_MEDIA_PAGE_SIZE } from '../constants/albumConstants.js';

/** Gallery filters are deliberately narrower than library filters. Cursors are hook-owned. */
export function albumMediaParams(filters) {
  if (Object.keys(filters).some((key) => key !== 'limit')) {
    throw new TypeError('Album media only supports limit; useInfiniteAlbumMedia owns the cursor.');
  }
  return { limit: filters.limit ?? DEFAULT_ALBUM_MEDIA_PAGE_SIZE };
}
