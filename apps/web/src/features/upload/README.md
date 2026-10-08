# Upload lifecycle

Public imports come from `@/features/upload/index.js`. This feature owns upload
sessions, direct storage transfers, progress, processing tracking, and duplicate
resolution. It never assigns Album, Category, or Tag relations. Compose those
actions in a page orchestration hook, after receiving the **final** media ID.

## Single file

```js
const upload = useFileUpload({ pollInterval: 1000, policy });
const progress = useUploadProgress(upload);
const mediaId = await upload.upload(file);
// mediaId is final only after READY; SKIP resolves to null.
```

`upload(file, { sessionId, uploadFileId })` also accepts a previously registered
file. Its name, MIME type, and size must match the registration. Each hook instance
owns one file lifecycle; dynamic queues can use `useFileUploads` instead.

## Multiple independent files

`useFileUploads({ pollInterval, policy })` exposes `upload(id, file, options)`,
`retry(id)`, `cancel(id)`, `resolveDuplicate(id, action)`, `cancelAll()`, and
`remove(id)`. Consumer IDs identify independent lifecycle controllers and their
retry checkpoints. `files[id]` holds the reusable lifecycle state, progress, and
duplicate actions. Removing an entry or unmounting aborts its browser work.
Consumers own queue scheduling and any post-upload assignment. Without explicit
session/file options, each entry creates its own session; this avoids registering
new files into a session that has already entered processing.

The upload promise remains pending during `DUPLICATE_PENDING`. Render the
`duplicateActions` when `needsDuplicateResolution` is true and call
`resolveDuplicate('SKIP' | 'USE_EXISTING' | 'KEEP_BOTH')`. That action returns a
promise for the same final result. `KEEP_BOTH` resumes processing polling.

Render `isProcessing` separately from byte progress. A successful PUT, 100% byte
progress, and a temporary `mediaId` do not mean processing is complete.
`finalMediaId` is populated only at READY. `useUploadProgress` exposes `loaded`,
`total`, `percent`, `isIndeterminate`, `isUploading`, `isProcessing`, and
`isComplete`. The fetch fallback has no byte progress and uses `percent: null`.

## Batches and session queries

```js
const session = useUploadSession({ sessionId, enabled: true, pollInterval: 1000, policy });
const created = await session.createSession.mutateAsync();
const registered = await session.registerFile.mutateAsync({
  sessionId: created.sessionId,
  file,
});
// Register ALL files in the batch before invoking upload for any file.
const mediaId = await upload.upload(file, {
  sessionId: created.sessionId,
  uploadFileId: registered.uploadFileId,
});
```

Session queries follow every cursor, including files outside the first page.
TanStack Query logic stays in feature hooks. Per-file queries isolate cancellation
from other files in the same session. Session query polling pauses when all files
are terminal or awaiting duplicate decisions; use `refetch` to explicitly refresh.

## Retry, cancellation, and validation

`retry()` preserves confirmed session/file identifiers and transfer/completion
checkpoints. It reconciles current server state before acting. A failed PUT gets a
fresh presigned URL; a failed completion retries completion without retransferring
bytes; failed tracking resumes queries; failed duplicate resolution retains its
chosen action. Metadata mutations have no automatic retries. If creation or
registration succeeds but its response is lost, the API offers no idempotency key
to recover the unknown identifier; explicit retry can leave an unused registration.

`cancel()` and unmount abort metadata requests, active PUTs, polling delays, and
duplicate waits. Cancellation is local: the API has no general cancellation route,
so already accepted processing may continue. Retrying a local cancellation queries
the server again. Backend FAILED is terminal and cannot be retried through this
API; start a new upload attempt instead.

Consume promise rejections in event handlers. Cancellation rejects with AbortError;
other failures use centralized `ApiError`. The hook exposes `error`, `canRetry`,
`isActive`, `phase`, and server lifecycle `status` for rendering.

`validateUploadFile(file, policy)` returns `{ valid, error }`. Default advisory
limits match the documented backend defaults: 100 MiB and the supported image/video
MIME set. Override `maxFileSize` and `supportedMimeTypes` for the deployment. Backend
validation remains authoritative. Storage must permit browser PUTs through CORS;
the feature never falls back to proxying binary data through the backend.
