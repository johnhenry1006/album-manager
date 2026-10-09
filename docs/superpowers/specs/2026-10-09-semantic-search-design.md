# Optional semantic search

Add an opt-in backend module alongside existing metadata search. Existing media UUIDs,
media statuses, taxonomy assignments, original bytes and object keys are unchanged.

## Boundaries and providers

Composition injects an embedding provider with `profile: { space, model, dimensions }`,
`embedImage({ bytes, mimeType })` and `embedText(text)`, returning numeric arrays.
Space identifies the versioned shared image/text coordinate system; model identifies
its exact version and preprocessing. Dimensions range from 1 to 4096. Providers must
be deterministic for pagination. An independent optional tag provider exposes
`revision` and `tagImage({ bytes, mimeType })`, returning `{ label, confidence }[]`.
Provider calls have a 30-second deadline and receive an AbortSignal. Tag revision is persisted so changing it triggers reindexing. Generated tags never
modify manual taxonomy. No provider SDK is required. An optional server-only adapter
module supplies providers; absent configuration creates no semantic routes or worker.

## Persistence and lifecycle

A separate SemanticIndex record per media and embedding space stores normalized vectors,
profile, source checksum, generated tags and tag revision, READY/FAILED status and safe
failure code. Cascade deletion removes derived records. Saves lock/recheck source media
so deletion or a changed checksum cannot resurrect an index. Queries join current live,
ready images and verify the checksum and profile. Trash is excluded immediately; restore
can reuse unchanged records. Missing or stale records are discovered in batches of 50;
failed records wait five minutes before reconciliation retries. Reconciliation runs each
minute in a separate BullMQ queue and worker. Provider errors never alter core media state.

## API and search

Authenticated POST /api/semantic-search accepts text, limit (1–100, default 20), cursor.
GET /api/media/:mediaId/similar accepts limit and cursor; the source image is excluded.
GET /api/media/:mediaId/semantic-tags returns generated tags with provenance.
Results are compact `{ id, score }` references; use existing media APIs for display.
Keyset pagination orders score descending then ID ascending, binds cursors to normalized
query vector/profile/source, and fetches one extra result. Changing the index between
pages can change results; no snapshot guarantee. A repository-backed vector-index port
owns search; the initial PostgreSQL implementation computes exact normalized dot products
without an extension or loading all vectors into application memory. This is a baseline
for small libraries; large deployments should inject an approximate vector index whose
adapter enforces live-media filtering and deterministic paging.

## Verification

Test provider validation, finite/nonzero vectors, incompatible profiles, indexing retries,
checksum/deletion races, independent tags, bounded input, cursor binding, authentication,
disabled composition, and existing metadata search. Add opt-in isolated PostgreSQL tests
for ranking, pagination, stale/trash exclusion, reconciliation and cascade deletion.
