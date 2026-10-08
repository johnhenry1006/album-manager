# Album feature

Consumers import from `@/features/album/index.js`. HTTP requests stay private in
`api/albumApi.js`; feature hooks own query and mutation policy. Query keys are
public for consumers that need to coordinate cache refreshes.

- `useAlbum(albumId, { enabled })` returns the detail query, including counts.
  Missing IDs disable the query.
- `useAlbums({ page, limit, q, visibility, sort }, { enabled })` returns the lightweight list envelope
  `{ items, pagination }` and query state. Page defaults to 1, limit to 50.
  Visibility accepts `PRIVATE` or `PUBLIC`; omit it for all albums. Sort accepts
  `newest` (the default), `oldest`, or `name` and applies before pagination.
- `useCreateAlbum()` accepts metadata through `mutate` or `mutateAsync`.
- `useUpdateAlbum()` accepts `{ id, ...metadata }`. Set/change/clear the cover
  using `coverMediaId`; a cover must already belong to the album.
- `useDeleteAlbum()` accepts an album ID. Soft deletion clears cached album
  detail/gallery data, refreshes lists and media memberships, and preserves files.
- `useInfiniteAlbumMedia(albumId, { limit, q, type, favorite }, { enabled })` returns the infinite
  query plus memoized deduplicated `items` and `nextCursor`. Call `fetchNextPage`
  when `hasNextPage` is true. Consumers cannot pass a cursor or other library filters.
  Search matches filenames; type accepts `IMAGE`/`VIDEO` and favorite is boolean.
  Cursors remain opaque; the server owns `(position, membershipId)` ordering.
  Changing the album or limit selects a separate cache entry.
- `useAlbumMediaActions(albumId)` returns `add` and `remove` mutation objects.
  `add.mutate({ mediaId, position })` adds or repositions a member; omit position
  to append a new member or preserve an existing member's position.
  `remove.mutate(mediaId)` removes membership and may clear the cover. Both refresh
  album lists and detail/counts, album gallery, media lists filtered by album,
  and the affected media detail.
  `refreshMedia()` invalidates all cached album galleries after global media
  changes, including inactive queries with different filters.

Queries forward cancellation signals and follow shared retry/freshness defaults.
Mutations expose their own pending/error state and refresh caches only on success.
Errors use the centralized HTTP error layer. Hooks do not navigate or notify.

`AlbumPicker` provides paginated searchable options with controlled `value` and
`onChange(id)`; empty string clears selection. Optional props are `label`,
`disabled`, `limit`, and `className`. A selected album outside the current page is
retained and its label comes from the shared detail query. It requires a query
provider and does not load every album to populate the picker.

`AlbumCover` accepts `album`, optional `coverMedia`, `sizes`, `aspectRatio`, and
`className`. A matching supplied media object avoids another request. Otherwise
it resolves `album.coverMediaId` through the public media detail hook. Rendering
uses the shared responsive image primitive with thumbnails only, never originals
or previews. Missing, failed, or unusable covers display its accessible fallback.

The only cross-feature dependency is the public media index, used for cover
queries, media query keys, and existing cursor-page flattening. Media does not
depend on album. Large album galleries can compose the public media virtual grid
with `useInfiniteAlbumMedia`; no page implementation is included here.
