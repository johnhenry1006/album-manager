# Trash feature

Pages import only the public hooks from `@/features/trash/index.js`:

- `useInfiniteTrash({ limit = 50 }, { enabled = true })` owns `GET /trash` cursor
  pagination. It returns the query plus deduplicated `items` and `nextCursor`.
  Only `limit` is supported; cursors belong to the hook. Requests pass cancellation
  signals through `trashApi` to `httpClient`. The server orders by deletion time
  with the media ID as a stable tie-breaker.
- `useRestoreMedia()` returns a mutation accepting a media ID.
- `usePermanentDeleteMedia()` returns a mutation accepting
  `{ mediaId, confirm: true }`; missing or non-boolean confirmation is rejected
  before making the deletion request.

`trashQueryKeys` is exported for collection cache coordination; `trashApi` stays
private. Successful mutations refresh trash, media and album caches through
`useTrashCacheActions`, consuming other features only through their public indexes.
Permanent deletion reuses the media feature's detail cache removal and refreshes
collections after failures as well, because a partial purge can prevent restoration.
Media depends on neither trash nor album, keeping these dependencies acyclic.

The page hooks own ID selection, operation snapshots, busy state, confirmation
and feedback. Confirmation locks selection and applies only to the captured IDs.
Each bulk operation deselects successful IDs and retains failures for retry.
Restore is disabled when any selected item has `canRestore: false` or unavailable
status. A failed purge refreshes this eligibility while keeping the ID selected
for another explicitly confirmed delete attempt.

The page reuses the media feature's `VirtualMediaGrid`, `useMediaSelection` and
page flattening helper. It never fetches active-media detail URLs for trashed items
and displays only gallery thumbnail data. Loading, empty and error states use
existing presentation components; cursor errors retain loaded cards and selection.
