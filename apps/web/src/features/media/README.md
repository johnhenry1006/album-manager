# Media feature

Pages and page hooks import hooks from `@/features/media/index.js`. The HTTP
adapter and query keys are private; no API client is exported.

- `useMedia(mediaId, { enabled })` returns the detail query. Missing IDs disable it.
- `useInfiniteMedia(filters, { collection = 'media', enabled })` returns the
  infinite query plus flattened `items`. Filters match `GET /media`, including
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

`components/` is reserved for feature UI; no gallery or full pages are implemented.
