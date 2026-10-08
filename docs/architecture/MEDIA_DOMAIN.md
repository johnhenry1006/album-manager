# Backend media domain

`apps/api/src/modules/media/index.js` is the public backend boundary for upload,
workers, and future Media API controllers. No HTTP routes are registered by this
module. It uses the existing Media and MediaVariant schema with the named-rendition migration required by the media worker.

## Composition and dependencies

```js
import { createMediaModule } from '#modules/media/index.js';

const { mediaService, mediaVariantService } = createMediaModule(database.client);
```

The application or worker owns the injected database client and its lifecycle.
Factories for both services and repositories are also exported for explicit dependency
injection. No client is constructed or connected when importing this module. Services
validate inputs and enforce domain invariants; only repositories issue Prisma queries.
Upload and workers must consume this boundary instead of implementing media persistence.

For atomic orchestration, compose the same module with an interactive transaction client
inside the caller's infrastructure/repository transaction boundary. All operations then
use that client. Await operations sequentially within a transaction. Media and variant writes use a savepoint to recover from identity/storage-key constraint violations without leaving the caller transaction aborted. Original registration uses
that same transaction, or starts one when given the application client.

## Service contracts

| Service | Method                                                     | Behavior                                                                 |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Media   | `create(input)`                                            | Create Media; default status PENDING.                                    |
| Media   | `update(id, patch)`                                        | Update allowed scalar Media fields on a live identity.                   |
| Media   | `load(id)`                                                 | Load a live Media identity or throw a not-found error.                   |
| Media   | `updateMetadata(id, patch)`                                | Persist dimensions, aspect ratio, checksum, or capture time.             |
| Media   | `updateProcessingStatus(id, status)`                       | Persist PENDING, PROCESSING, READY, or FAILED; allows worker retries.    |
| Media   | `findDuplicateByChecksum(checksum)`                        | Return matching Media or null, deliberately including soft-deleted rows. |
| Media   | `detectDuplicateByChecksum(checksum, { excludeMediaId }?)` | Return NEW_MEDIA or DUPLICATE_FOUND for active media only.               |
| Variant | `create(input)`                                            | Register an asset for live Media; serialize ORIGINAL registration.       |
| Variant | `update(id, patch)`                                        | Update derivative size, storage key, dimensions, or quality.             |
| Variant | `load(id)`                                                 | Load a variant with a live parent or throw a not-found error.            |
| Variant | `findByIdentity({ mediaId, type, format, name })`          | Load a rendition by its unique rendition identity, or return null.       |

Methods are asynchronous. Backend mappers return explicit scalar fields, keeping byte
sizes as BigInt and timestamps as Date. Relations are excluded. Future HTTP mappers
must deliberately serialize BigInt and provide lightweight list contracts.

Inputs reject unknown fields. IDs are UUIDs; file sizes accept nonnegative BigInt,
safe integers, or decimal strings within PostgreSQL bigint range. Dimensions are
positive PostgreSQL integers and must be supplied or cleared together. Media aspect
ratio is derived from dimensions; a supplied ratio must agree. Checksum is normalized
to lowercase SHA-256; variant format and media extension are normalized to lowercase.
Capture time accepts Date or null. Variant quality accepts 1–100 or null, and storage
keys reuse the existing storage validation. Omitted optional fields stay unchanged on
update; null clears nullable fields. Variant media/type/format identity cannot change.

## Reusable duplicate detection

Import `calculateMediaChecksum` from the public media `index.js`. It calculates a
lowercase SHA-256 digest from original encoded bytes (`Buffer` or `Uint8Array`) or
an async iterable of byte chunks, including Node readable streams. Streams are
consumed incrementally, and read failures propagate rather than yielding a partial
digest. The helper never reads storage itself. Use original file bytes, not processed
pixels, a filename, or an S3 ETag; differently encoded files are not byte duplicates.

```js
import { calculateMediaChecksum, createMediaModule } from '#modules/media/index.js';

const { mediaService } = createMediaModule(database.client);
const checksum = await calculateMediaChecksum(originalBytes);
const result = await mediaService.detectDuplicateByChecksum(checksum, {
    excludeMediaId: uploadMediaId,
});
```

The optional exclusion prevents an already-created upload media item from matching
itself during processing or retries. Omit it when no current media identity exists.
Invalid digests and invalid exclusion UUIDs fail before the lookup. Hex digests are
normalized to lowercase.

The result is a backend domain value, without HTTP serialization:

```js
const newResult = { type: 'NEW_MEDIA', checksum };
// or
const duplicateResult = { type: 'DUPLICATE_FOUND', existingMediaId, checksum, existingMedia };
```

`existingMedia` uses the same scalar projection as `load`: filename, media type,
MIME type, extension, byte size, dimensions/aspect ratio, processing status, checksum,
capture time, and timestamps. Byte sizes remain BigInt and dates remain Date.
Persistence relations and storage keys are excluded. Metadata may be null while
processing. Active means `deletedAt: null`, independent of processing status.

Detection only reads media through its repository; it neither writes upload state,
deletes objects, nor resolves reuse/keep/restore choices. Upload services and future
workers can consume this contract without controller dependencies. A repository
failure propagates instead of reporting NEW_MEDIA.

NEW_MEDIA means no other active match was found at lookup time. Checksum is
indexed rather than unique, so explicitly accepted duplicates can retain independent
identities. Lookups choose the oldest `(createdAt, id)` match deterministically.
The worker serializes detection and checksum reservation using a short transaction
advisory lock. Callers that need the same race protection must use that gate.

## Integrity and errors

Normal reads and Media updates filter `deletedAt: null`. Variant reads and updates
filter through a live parent. The legacy `findDuplicateByChecksum` lookup includes
deleted Media explicitly; active detection excludes them. Duplicate policy belongs
to orchestration, not to a checksum uniqueness constraint.

A parent-row lock checks that the parent remains live during every variant registration
and serializes ORIGINAL registration across formats. Only one ORIGINAL
is accepted per Media, and ORIGINAL variants cannot be updated. No method rewrites
stored bytes; storage and image processing remain separate responsibilities.

`MediaDomainError` is exported with a stable code and statusCode compatible with
centralized errors. Invalid input uses 400, missing rows use 404, and media-identity,
variant-identity/storage-key, or immutable-original conflicts use 409. Unexpected
adapter errors propagate to the existing centralized handler or worker boundary.

## Verification

Run `npm test --workspace @album-manager/api -- src/modules/media` for focused domain
and repository query-contract tests. Real PostgreSQL tests are opt-in:

```sh
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/media.integration.test.js
```

These tests apply the migration in an isolated temporary schema, roll back transactional
test rows, and remove that schema afterward, including committed concurrency-test rows.
Application tables are never changed. Run root `npm test` and `npm run lint` for
repository-wide verification.

## Processing persistence boundary

The media processing repository is a documented cross-domain persistence boundary:
it atomically updates Media, MediaMetadata and the linked UploadFile for a job.
It checks the association and cancellation/deletion again under locks ordered as
session, upload file, media, matching upload completion. It contains no storage
calls or image transformations. The job composition uses public module exports;
no cross-module internal imports are needed. See [worker](MEDIA_PROCESSING.md).
