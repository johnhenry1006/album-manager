# Media-processing worker

Run `npm run worker:media --workspace @album-manager/api` as a separate process,
using the same database, S3 and Redis configuration as the API. Apply migrations
and regenerate Prisma Client first. `QUEUE_WORKER_CONCURRENCY` defaults to 1 and
accepts 1–32. SIGINT/SIGTERM drains active jobs before releasing adapters; the API
shutdown timeout also applies to this process. Redis readiness has a startup deadline;
a fatal consume-loop rejection closes the runtime and sets an unsuccessful exit
code so a supervisor can restart it. The API only dispatches jobs.

## Job and responsibilities

Queue `media-processing`, job `process-media`, input:

```js
{ mediaId, uploadFileId, allowDuplicate: false }
```

IDs must be UUIDs; unknown keys and non-boolean duplicate policies are rejected.
The upload must reference this Media and must not be cancelled. A READY retry
repairs the upload state without reading or generating derivatives again.

The job composition consumes public media/settings modules. The thin BullMQ worker
owns transport/lifecycle; the media processing service owns orchestration; the
checksum gate owns duplicate policy and reservation; the rendition service owns
object/variant registration. The processing repository owns short transactions
for Media, UploadFile and MediaMetadata, including association and live-state
rechecks. No object I/O or transformations occur inside those transactions.

## Flow

Load Media and the original variant, read its encoded bytes through StorageProvider,
and calculate a missing SHA-256 checksum. The reusable duplicate detector excludes
the current Media. Detection and checksum reservation are serialized by a
transaction advisory lock for the digest. A linked, non-cancelled upload receives a
durable processingAcceptedAt checkpoint in that same transaction. Retries retain
that admission if another upload later explicitly accepts identical bytes, while
still invoking the reusable detector. If another active identity exists and
allowDuplicate is false, mark UploadFile DUPLICATE_PENDING with duplicateOfMediaId,
leave Media PENDING, and return without image/video inspection or generation.

Otherwise inspect dimensions/MIME and extract supported optional EXIF. Read one
optimization settings snapshot and let the processor generate orientation-normalized
OPTIMIZED, PREVIEW, THUMBNAIL-800/400/200 (or configured thumbnail sizes) and optional
BLUR_PLACEHOLDER. The processor never changes original bytes. Malformed, oversized,
animated or multi-page images fail explicitly.

VIDEO selects the injected FFmpeg adapter in the same worker. FFprobe validates
the decoded container against the registered MP4, QuickTime or WebM format and
requires a usable video stream with positive duration. Display dimensions account
for rotation and sample aspect ratio. The shared MediaMetadata row stores nullable
`duration` (seconds), `videoCodec`, `audioCodec`, `frameRate` (fps), `bitrate` (bits/s)
and raw probe metadata. Existing image metadata remains valid.

FFmpeg creates a poster; Sharp generates the existing PREVIEW, THUMBNAIL and optional
BLUR_PLACEHOLDER variants using the same image settings. A video-specific OPTIMIZED
variant named `playback` contains H.264/AAC MP4 with fast-start metadata, square pixels,
even dimensions, and a maximum dimension of 1920. Video derivatives use the same
content-addressed keys, variant repository and storage abstraction as images. No
video queue, domain tables, album infrastructure or routes are introduced.

Install FFmpeg 6+ and FFprobe with libx264/AAC on the worker host. Apply
`20261009210000_video_metadata` using `npm run db:deploy` and regenerate the client
with `npm run db:generate` before starting the updated worker/API. FFmpeg runs with
argument arrays, local file input protocols and a restricted container whitelist.
Inspection/poster extraction time out after 30 seconds and playback encoding after
five minutes. Adapter-private temporary files are removed on success and failure.
Longer or expensive inputs can fail these limits and retain their original bytes.

The detail API signs playback as a normal display variant. Native video controls use
the PREVIEW poster and `preload="none"`; image selection excludes video formats.
Playback failures allow refreshing the signed URL. Existing originals remain available
through the explicit download action. Album relations, tags, categories, favorites,
trash/restore/deletion and lexical search all operate on the same Media identity.
Optional semantic indexing remains image-only.

Upload derivative objects and register named variant rows. Upsert extracted metadata,
update checksum/dimensions/aspect ratio/MIME and commit Media READY plus UploadFile
READY together, clearing previous error/candidate fields. A failure records sanitized
FAILED states and rethrows so BullMQ applies its configured retries. Originals and
successfully persisted derivatives are preserved. If the database itself cannot
record failure, the original processing error still reaches BullMQ. A concurrent
READY result is protected from failure/duplicate-state regression.

## Retry and duplicate acceptance

Variant identity is `(mediaId, type, format, name)`. Generated names distinguish
thumbnail sizes. Existing rows whose objects exist are reused. Missing objects are
repaired on incomplete retries. New derivative keys include a SHA-256 digest of
the output bytes, so an object uploaded before row registration fails is reused
without producing another key. A concurrent registration conflict reloads the
winning identity. No processing path uploads to or updates an ORIGINAL variant.
Unreferenced derivative objects from overlapping attempts with differing settings
are preserved; a future garbage collector may remove them.

Checksums are indexed rather than unique, allowing an explicit duplicate to keep
its own identity. To resume a deferred upload, enqueue its existing IDs with
allowDuplicate: true. The producer uses a separate stable `mediaId-allow-duplicate`
job ID, so retention of the initial completed duplicate-pending job cannot suppress
acceptance. Both job IDs use the normal three attempts and exponential backoff.
No duplicate-resolution HTTP endpoint is added by this worker task.

## Verification

Unit tests mock storage, image/video processing, duplicate detection and settings to
exercise orchestration, partial writes, failures and retries. Lifecycle/repository
contract tests cover readiness, cleanup and transactional state guards.

```sh
npm test
npm run lint
npm run format:check
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/media.integration.test.js src/modules/uploads/repositories/upload.integration.test.js
QUEUE_TESTS=1 npm test --workspace @album-manager/api -- src/infrastructure/queue/queue.integration.test.js
```

Real video tests use small FFmpeg-generated MP4, MOV and WebM files (VP9/Opus
encoders are required for WebM fixtures), inspect metadata and decode generated
posters/playback. Database integration tests apply all migrations in isolated schemas. Queue tests
use unique Redis prefixes and clean up only their own queues.
