# Media trash

All routes require a session; mutations also require X-CSRF-Token. Favorite flags
and filters belong to the caller; library data remains shared. See [Auth API](AUTH.md).

The authenticated shared-library media module owns trash behavior. Controllers call lifecycle
services; repositories own database operations. Object removal is isolated in
`mediaStorageDeletion.service.js` and uses the injected storage provider.

| Route                                  | Request                              | Response                         |
| -------------------------------------- | ------------------------------------ | -------------------------------- |
| `DELETE /api/media/:mediaId`           | No body or query                     | `204`; sets `deletedAt`          |
| `GET /api/trash`                       | Optional `limit` and `cursor`        | `200`; paginated trash           |
| `POST /api/trash/:mediaId/restore`     | No body or query                     | `204`; clears `deletedAt`        |
| `DELETE /api/trash/:mediaId/permanent` | JSON `{ "confirm": true }`; no query | `204`; deletes objects and media |

IDs must be UUIDs. Invalid input returns `400`; missing media returns `404`.
Soft delete and restore are idempotent while the record exists. Repeated soft
delete preserves the initial deletion timestamp, so retries do not reset retention.
Normal delete never removes binaries, variants or relations. Normal collection,
detail and original-URL endpoints exclude deleted media; restore makes retained
favorites, album memberships, tags and categories visible again.

## Trash collection

Trash is ordered by `(deletedAt DESC, id DESC)` with a value-based cursor.
`limit` defaults to 50 and uses the configured media-list maximum. Only `limit`
and `cursor` are accepted; malformed/repeated query parameters are rejected.
The response has `items`, `nextCursor` and `hasMore`, with `Cache-Control: no-store`.

Items reuse the compact gallery contract and add ISO `deletedAt`, nullable ISO
`purgeStartedAt` and boolean `canRestore`. Only signed thumbnail URLs are included;
originals, EXIF and storage keys are excluded. Purging entries have no thumbnail
URLs and `canRestore: false`. A database-only application can soft-delete,
restore and list trash without signing thumbnails. Permanent deletion needs storage.

## Deliberate, retryable permanent deletion

Live media cannot be permanently deleted (`409`); it must first be trashed.
Explicit confirmation is required for every HTTP attempt.

1. A short transaction locks the media row, verifies trash state, commits
   `purgeStartedAt`, and captures every recorded variant key, including originals.
2. The dedicated storage service validates every key before deletion. Missing
   object deletion is idempotent. Storage deletion runs outside database transactions.
3. After every object deletion succeeds, another transaction removes variants
   and media. Existing foreign keys remove associations and metadata, clear album
   covers and detach upload bookkeeping references.

Once marking commits, restore returns `409`. Storage failures, finalization
failures and process restarts retain the marker and manifest for a retry. A
partially purged item cannot become live again. Successfully purged media returns
`404` on subsequent HTTP attempts. Concurrent attempts already holding a manifest
can finish idempotently.

Permanent deletion requires an owned database client rather than an injected
outer transaction (`409`), preventing a caller rollback from undoing the marker
after irreversible storage calls. Missing storage returns `503` before marking.
Errors use centralized responses and exclude adapter details.

Rendition uploads and registration hold the same live media row lock. Soft delete
waits for an in-flight rendition; later writes fail before uploading. Image
transformations stay outside this guarded storage/persistence transaction, which
has a 30-second timeout. Unregistered objects left by earlier database failures
remain a separate reconciliation concern; purge uses the recorded variant manifest.

## Retention cleanup

The public media module exports `createMediaTrashModule({ client, storage, config })`.
Its service exposes `cleanupExpired({ before: Date, limit: number })`. The dedicated BullMQ
job computes an explicit retention cutoff and calls this service without HTTP
objects. The cutoff must be valid and no later than the current time. Batches
default to 50, accept 1–200 candidates, and order by `(deletedAt ASC, id ASC)`.

Eligibility is rechecked under the media lock before marking, so restored or
recently re-trashed media is skipped. Pending purges retry through the same path.
Results contain `deleted`, `skipped` and `failed` ID arrays; a failed candidate
does not abort the batch. The dedicated cleanup process registers an hourly schedule with a default thirty-day
retention. See [Media cleanup worker](../architecture/MEDIA_CLEANUP.md).

## Migration and tests

Deploy `20261008180000_media_trash` before running this version and regenerate
Prisma. The migration adds the purge timestamp, a check requiring purging media
to remain trashed, and a `(deletedAt, id)` index.

```sh
npm test --workspace @album-manager/api -- src/modules/media/services/mediaTrash.service.test.js src/modules/media/services/mediaRenditions.service.test.js
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/mediaTrash.integration.test.js
```

PostgreSQL tests apply migrations in a disposable schema and cover retained
objects, restore, pagination ties, cleanup, restart after partial failure,
retention selection and concurrent rendition persistence.
