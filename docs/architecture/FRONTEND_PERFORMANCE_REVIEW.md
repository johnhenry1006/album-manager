# Frontend gallery and list performance review

Reviewed 2026-10-09 against `ARCHITECTURE_RULES.md` and `FRONTEND_STRUCTURE.md`.
Scope includes the library, favorites, search, trash, album gallery and library
picker, album list, category/tag management, dashboard recent lists, upload queue
and option pickers. Existing feature/page boundaries are preserved.

## Issues found and fixed

- `MediaCard` passed preview variants into `ResponsiveImage`, allowing the browser
  to choose a large preview from `srcset`. It now accepts only thumbnails from
  both descriptor arrays; originals and previews are excluded.
- `ResponsiveImage` included `sizes` in its child key, remounting loaded images
  during responsive resizing. Changes to `sizes` now update the existing image.
- Category management recursively rendered the entire tree. It now displays at
  most 50 categories per page, retaining nested branches within the page and the
  original child flag for deletion eligibility. Traversal is iterative and
  memoized against server data. Parent choices also display at most 50 matches
  plus the current selection, with debounced local search and pagination. Parent choices
  are no longer rebuilt for every draft keystroke.
- Upload queues rendered every selected file. Presentation now paginates at 50
  rows without changing upload scheduling, retries, or actions. Pages clamp when
  files are removed.
- Album picker and upload album/category/tag searches requested every keystroke.
  They now use the existing 300 ms debounce and disable queries while text is
  pending. Page navigation remains immediate.
- Media, album-media and trash infinite queries inherited five-minute inactive
  retention. They now release inactive queries after one minute, reducing memory
  retained by abandoned filter combinations and routes.

## Requirements checked

| Requirement                         | Findings                                                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination for large collections    | Cursor media pages default to 50; albums display at most 48; tags use 50; options use bounded API pages; category and upload presentation now use 50. Dashboard recent lists are bounded on the server.                                       |
| TanStack Virtual for media grids    | Library, favorites, search, trash, album media and add-media picker all reuse `VirtualMediaGrid`.                                                                                                                                             |
| TanStack Query for infinite loading | `useInfiniteMedia`, `useInfiniteAlbumMedia`, and `useInfiniteTrash` own requests, cursors and cancellation signals.                                                                                                                           |
| Thumbnail-only grid images          | Media cards exclude preview/original types. Album covers and dashboard lists use thumbnails. Missing sources show a fallback.                                                                                                                 |
| Responsive images                   | `ResponsiveImage` supplies width-based `srcset` and `sizes`; the virtual grid supplies measured card width.                                                                                                                                   |
| Lazy loading                        | Shared gallery/cover/recent images use `loading="lazy"` and `decoding="async"`. The detail viewer intentionally loads its main derivative immediately.                                                                                        |
| Layout stability                    | Shared images reserve aspect ratio and provide valid dimensions when available; virtual rows have explicit geometry.                                                                                                                          |
| No automatic originals              | Original signing uses a mutation invoked by the detail button. Rendering, refetching and gallery loading do not request original files.                                                                                                       |
| Thin pages                          | Requests stay in feature hooks; orchestration stays in page hooks. No network logic was moved into pages.                                                                                                                                     |
| Rerenders and memoization           | Grid/row/card memoization and stable activation/selection callbacks are retained. Page flattening is memoized by query pages. New hierarchy/parent filtering memoization avoids repeated whole-tree work. No blanket callback/memo additions. |
| Stable keys                         | Query keys use serializable filter values and IDs; TanStack hashes equivalent objects independent of object identity. Cursors are page parameters, separate from collection keys.                                                             |
| Filter request control              | Text/MIME media filters and album list searches already debounce. Picker searches now debounce too. Invalid MIME/date controls suspend search requests; pagination guards prevent duplicate next-page loads and error retry loops.            |
| Client state                        | Media server data stays in Query; selection stores IDs. Local category/queue pagination adds only page/search controls.                                                                                                                       |
| Infinite retention                  | Inactive gallery retention is one minute. Active pages are intentionally retained; see remaining risks below.                                                                                                                                 |
| Configurable overscan               | Already supported and validated in `VirtualMediaGrid`/`useVirtualMediaGrid`; default is three rows. No rewrite needed.                                                                                                                        |
| Bounded media DOM                   | Existing 10,000-item test mounts at most 12 cards initially and 15 after scrolling with the tested 620px viewport, 300px height and one-row overscan. Counts scale with viewport/columns/overscan, not collection length.                     |

## Files changed

Production paths, relative to `apps/web/src`:

- `components/media/ResponsiveImage.jsx`
- `features/media/components/MediaCard.jsx`
- `features/media/hooks/useInfiniteMedia.js`
- `features/album/components/AlbumPicker.jsx`
- `features/album/hooks/useInfiniteAlbumMedia.js`
- `features/trash/hooks/useInfiniteTrash.js`
- `services/queryClient.js`
- `pages/categories/CategoryListPage.jsx`
- `pages/categories/hooks/useCategoryListPage.js`
- `pages/categories/components/CategoryTree.jsx`
- `pages/categories/components/CategoryForm.jsx`
- `pages/categories/components/CategoryParentPicker.jsx` (new)
- `pages/upload/components/UploadQueue.jsx`
- `pages/upload/hooks/useUploadOptions.js`

Regression tests:

- `components/media/ResponsiveImage.test.jsx`
- `features/media/components/VirtualMediaGrid.test.jsx`
- `features/media/hooks/media.test.js`
- `features/album/hooks/album.test.jsx`
- `pages/categories/TaxonomyPages.test.jsx`
- `pages/upload/components/UploadQueue.test.jsx` (new)
- `pages/upload/hooks/useUploadOptions.test.jsx` (new)

Documentation: this report and `docs/architecture/FRONTEND_STRUCTURE.md`.

## Remaining performance risks

1. Active infinite queries still retain every loaded page. Flattening/deduplication
   costs grow with loaded records; invalidation/refetch can sequentially reload all
   pages. Virtualization bounds DOM, not query memory. Applying `maxPages` would
   discard earlier scrollable results because the current API/grid only support
   forward cursors. Safe eviction requires a deliberate navigation/scroll-restoration
   design or backward pagination. See [TanStack's limited infinite query guidance](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries).
2. Category presentation is bounded, but the tree endpoint still downloads and
   retains the complete hierarchy, needed by the existing parent/subtree rules.
   Very large trees require a paginated/lazy hierarchy API and server-side parent
   eligibility search. The one-minute gallery policy does not apply to taxonomy
   queries.
3. Album list covers still request media detail metadata per distinct cover ID
   when no supplied cover descriptor exists. Images remain thumbnail-only, but
   this is up to 48 additional metadata requests per album page. A lightweight
   cover descriptor in the album list response would remove those requests.
4. Upload queues retain `File` references and retry/lifecycle metadata until
   removal, Clear finished, or unmount. Progress updates still scan/project the
   complete queue; pagination reduces rendered rows but does not bound queue
   memory or update cost. Clearing finished files is available already.
5. Selection IDs intentionally survive filter/page changes and can grow with user
   selections. No full media objects are copied into selection state.
6. Verification uses jsdom geometry and fixtures, not a production browser heap
   profile or network waterfall. Browser decoding/cache costs and scroll frame
   timing remain unmeasured.

## Verification

- Frontend Vitest suite: 45 files, 392 tests passed.
- Frontend production build passed.
- Frontend ESLint and diff whitespace checks passed.
