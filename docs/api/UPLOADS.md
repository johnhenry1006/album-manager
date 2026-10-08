# Direct upload API

The upload module uses metadata-only Fastify routes. Browsers send media bytes
directly to S3-compatible storage using the returned presigned PUT URL. Upload
controllers call the upload service; upload repositories persist UploadSession and
UploadFile; Media and ORIGINAL persistence reuse the public media domain. Processing
jobs enter the `media-processing` queue; this implementation does not start workers.

## Routes and contracts

| Route                                            | Input                                          | Successful result                                                               |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/uploads/sessions`                     | Empty body or `{}`                             | 201: `{ sessionId, status, createdAt, completedAt }`                            |
| `POST /api/uploads/sessions/:sessionId/files`    | `{ filename, mimeType, fileSize }`             | 201: file metadata including `uploadFileId`                                     |
| `POST /api/uploads/files/:uploadFileId/presign`  | Empty body or `{}`                             | 200: `{ uploadFileId, status, url, method, headers, expiresIn }`                |
| `POST /api/uploads/files/:uploadFileId/complete` | Empty body or `{}`                             | 202 while processing; 200 if already READY: `{ uploadFileId, status, mediaId }` |
| `GET /api/uploads/sessions/:sessionId`           | Optional `limit` (1–100, default 25), `cursor` | Session metadata plus `files` and `nextCursor`                                  |

File metadata is `{ uploadFileId, sessionId, status, filename, mimeType, fileSize,
mediaId, createdAt, updatedAt }`. Output byte sizes are decimal strings; timestamps
are UTC ISO strings. Registration accepts a safe integer or a decimal string for
fileSize. Storage keys, adapter data, and raw failure details are not returned.

Session files use `(createdAt ASC, id ASC)` ordering. Pass `nextCursor` to retrieve
the next page. Cursors must identify a file within that session. Session status is
aggregated from all file statuses, including files outside the current page, so
later worker updates are visible during polling. Workers remain responsible for
persisting final session completion timestamps.

## Browser sequence

1. Create a session and register its file metadata before starting completion.
2. Request each file's presigned upload URL.
3. PUT bytes to that URL using the exact returned method and headers, including
   the signed Content-Type. Storage CORS must allow the browser origin and PUT.
4. After a successful PUT, notify the completion endpoint.
5. Store the returned uploadFileId and mediaId; poll session pages for progress.

Registered files become UPLOADING when presigned and PROCESSING only after the
processing queue accepts the job. A session becomes PROCESSING once every file has
left registration/uploading. Further file registration is rejected for a session
that has already entered processing. READY is reserved for workers after processing.

## Verification, persistence, and retries

The browser URL targets a server-selected key under `uploads/<sessionId>/<fileId>/source`.
Completion HEADs the object and verifies its existence, exact registered size, configured
size limit, Content-Type, and ETag. These are metadata checks; worker processing must
validate/decode actual media bytes before declaring media READY.

Completion holds a database lock on the session and file. It creates PROCESSING Media
through the existing media service, conditionally copies the verified staging version
to a new original key based on that Media UUID, then registers ORIGINAL through the
existing variant service. Media, ORIGINAL, and UploadFile.mediaId commit together.
CopySourceIfMatch protects against the staged object changing between verification
and copy. Existing originals are never signed for browser writes or recopied on retry.

After committing persistence, the API enqueues `process-media` with `{ mediaId,
uploadFileId }` and jobId equal to mediaId. Stable IDs suppress duplicate enqueue
attempts while the job is retained. BullMQ jobs have three total attempts and
exponential backoff starting at one second. Future processors must be idempotent.
See [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids) and
[producer connections](https://docs.bullmq.io/guide/connections).

If queue acceptance fails, completion returns 503. Media and ORIGINAL stay linked to
the UPLOADING file; retry the same completion request. The retry reuses that media
identity and original without recopying. A repeated successful completion returns the
same tracking identifiers. Presigning is rejected once media is linked. Final status
updates preserve a fast worker's newer status instead of overwriting it with PROCESSING.

Database and Redis acceptance are separate operations, without a transactional outbox.
A crash between them requires completion retry; this implementation does not reconcile
pending submissions automatically. Staging objects remain recorded on UploadFile for a
future cleanup worker or bucket lifecycle policy. A storage copy followed by database
rollback can leave an orphan original; storage-aware orphan cleanup is also deferred.
No existing bucket lifecycle policy is changed by this API.

## Validation and errors

- IDs must be UUIDs. Filenames are normalized and must be safe basenames, without
  paths, control characters, reserved device names, or excessive UTF-8 byte length.
- MIME types must belong to the configured supported set. Media type, extension,
  and original format are derived from the accepted MIME type.
- Byte size must be positive and within the configured limit. File counts are
  checked while holding the session lock, including concurrent registrations.
- Routes accept metadata requests only, with a 16 KiB body limit; image/binary
  content types are rejected rather than proxied through Fastify.
- Validation failures use 400, missing records 404, absent objects/invalid lifecycle
  operations 409, and processing queue unavailability 503 through centralized errors.

## Configuration

| Setting                        | Default                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `UPLOAD_MAX_FILE_SIZE_BYTES`   | 104857600 (100 MiB); maximum 5368709120 for single PUT                                           |
| `UPLOAD_MAX_FILES_PER_SESSION` | 1000                                                                                             |
| `UPLOAD_URL_EXPIRY_SECONDS`    | 900; range 1–3600                                                                                |
| `UPLOAD_SUPPORTED_MIME_TYPES`  | image/jpeg, image/png, image/webp, image/gif, image/avif, video/mp4, video/webm, video/quicktime |

MIME configuration can restrict the documented supported set. Upload policy is validated
at startup. Redis producer settings use the existing REDIS_HOST/PORT/PASSWORD plus
REDIS_DB, REDIS_TLS, REDIS_CONNECT_TIMEOUT_MS, and QUEUE_PREFIX in `.env.example`.
The application owns producer readiness and shutdown. No connections open on import.

## Tests

`npm test` runs service, HTTP, policy, queue-producer, and storage-adapter tests without
external services. Optional checks use only test-owned schemas or Redis namespaces:

```sh
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/uploads/repositories/upload.integration.test.js
QUEUE_TESTS=1 npm test --workspace @album-manager/api -- src/infrastructure/queue/queue.integration.test.js
```

PostgreSQL tests exercise actual HTTP composition and media repositories, concurrent
completion, rollback/retry, file-count races, and equal-timestamp pagination. Redis
tests verify actual job acceptance and duplicate suppression. Apply normal migrations
before using the production API; tests do not migrate application tables.
