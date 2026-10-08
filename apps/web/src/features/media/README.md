# Media feature

Pages and page hooks import hooks from `@/features/media/index.js`. The HTTP
adapter and query keys are private; no API client is exported.

- `useMedia(mediaId, { enabled })` returns the detail query. Missing IDs disable it.
- `useInfiniteMedia(filters, { collection = 'media', enabled })` returns the
  infinite query plus memoized flattened `items` and the latest `nextCursor`. Filters match `GET /media`, including
  `album`, `favorite`, and `q`. Use `{ collection: 'trash' }` with only `limit`
  for trash. Call `fetchNextPage` when `hasNextPage` is true. The hook owns the
  opaque cursor; the backend owns deterministic ordering and its ID tie-breaker.
- `useMediaSelection(initialIds)` exposes `selectedIds`, `selectedCount`,
  `isSelected`, `select`, `deselect`, `toggle`, `selectAll`, `clearSelection`, and
  `retainSelection`. All operations take IDs or iterable ID collections, never
  page data. Selection persists across filters and loaded pages; page orchestration
  chooses when to clear it or retain only explicitly supplied IDs.
- `useFavoriteMedia()` returns `favorite` and `unfavorite` mutation objects.
  Each accepts a media ID through `mutate` or `mutateAsync`. Favorites lists use
  `useInfiniteMedia({ favorite: true })`.
- `useMediaActions()` returns `trash`, `restore`, and `permanentDelete` mutation
  objects. Trash and restore accept IDs. Permanent deletion accepts
  `{ mediaId, confirm: true }` and rejects missing confirmation.
- `useMediaVariants(media)` derives `variants`, `thumbnail`, `preview`, and
  `placeholder` from existing detail or lightweight gallery data. It makes no
  requests and excludes original variants. Signed URLs remain temporary; consumers
  can refetch the owning query when a display URL expires.

Queries forward cancellation signals. Mutations refresh media collections and
cached details on success; deletion removes cached detail. Permanent deletion
also refreshes on failure because a partial purge can prevent restoration.
Errors come from the shared HTTP error layer. Mutation objects expose loading
and error state; this feature does not impose notifications or page navigation.

## Virtual gallery

Import `VirtualMediaGrid` from the feature index. Compose it with any source of
compact media items; it does not request detail data or depend on a page:

```jsx
const media = useInfiniteMedia(filters);

<VirtualMediaGrid
  items={media.items}
  isLoading={media.isPending}
  hasNextPage={media.hasNextPage}
  isFetchingNextPage={media.isFetchingNextPage}
  onLoadMore={media.fetchNextPage}
  nextCursor={media.nextCursor}
  paginationKey={JSON.stringify(filters)}
  onActivate={handleOpenMedia}
  height={600}
  minColumnWidth={180}
  aspectRatio={1}
  overscan={3}
/>;
```

The scroll viewport has a controlled `height` (CSS length or pixels). Columns
respond to its measured content width, rather than the whole browser. Cards use
one positive `aspectRatio` for all rows; captions overlay the image so filenames
cannot change row height. `gap` defaults to 12px. `overscan` counts extra **rows**
on either side, and `endThreshold` defaults to two rows before the end of loaded
content. Only virtual rows create cards; no full row array or full gallery DOM
is constructed. Media IDs key cards; column count and each row's first media ID
key rows. `ResponsiveImage` receives only supplied thumbnail/preview sources.

`useVirtualMediaGrid` is also exported for custom gallery composition. It returns
`scrollRef`, `virtualizer`, `virtualRows`, `rowCount`, `columnCount`, `cardWidth`,
`rowHeight`, `totalHeight`, `isNearEnd`, and `isLoadingMore`. Attach `scrollRef`
to the controlled scroll viewport. Use a stable scrollbar gutter and no inner
padding/borders, as the supplied component does, to keep measured row geometry
aligned with the CSS grid. Custom compositions can omit `onLoadMore` and consume
`isNearEnd` themselves.

Automatic loading waits for a visible range, `hasNextPage`, and no pending
request. It suppresses repeat requests for the same loaded boundary until items
advance or the user leaves the end region. `paginationKey` distinguishes filter
sets even if boundary IDs coincide. Pass `nextCursor` from the infinite hook so
overlapping pages can advance pagination even when the unique item count stays
the same. Rejected requests stay owned by the caller's
query/error UI and do not loop; callers can explicitly retry with `fetchNextPage`.
Flattening cursor pages is memoized and removes overlapping IDs while retaining
item references; scroll updates therefore do not flatten the full library again.
`MediaGridRow` and `MediaCard` are memoized. Pass a stable `onActivate(media)`
callback to skip unchanged card renders.

`MediaEmptyState` wraps the shared empty state with customizable `title`,
`description`, and `action`. The grid supports `emptyTitle`, `emptyDescription`,
`label`, and an outer `className`. No full pages are implemented.
