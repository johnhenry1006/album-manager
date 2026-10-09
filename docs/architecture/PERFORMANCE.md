# Backend performance strategy

Reviewed 2026-10-09 against [Backend structure](BACKEND_STRUCTURE.md),
[Architecture rules](ARCHITECTURE_RULES.md), and
[Database conventions](../database/DATABASE_RULES.md). This describes the current
implementation and its known large-library limits, rather than a new caching or
database architecture. Runtime code remains JavaScript; repositories own queries,
services coordinate work, and infrastructure owns connections.

## Collection reads and payloads

Media, trash and album-media lists fetch `limit + 1` records to determine whether
another page exists, without calculating a total count. Only the returned page
is mapped and signed; the extra record is not signed. Media/trash default to 50
records, with a default server maximum of 200. `MEDIA_LIST_MAX_LIMIT` can raise
the configured maximum to 1000. Album-media consumes that configuration but caps
its effective maximum at 200.

Gallery projections select IDs, basic display metadata, favorite presence and
thumbnail descriptors. They exclude originals, previews, file bytes, checksum,
EXIF, raw metadata and full membership lists. Mappers remove storage keys after
signing. Album-media adds only membership ID and position. Single-media details
deliberately use a richer projection and are separate from gallery reads.

Album/category/tag management uses offset pages with exact counts. Default page
sizes are 50 and maximum sizes are 200. Page and count queries share a
RepeatableRead transaction. This keeps their snapshot consistent, but does not
make large offsets or exact counts cheap. Album descriptions remain in album
list responses under the existing contract; descriptions can be 5000 characters.
Page limits therefore bound records, not a strict response byte budget.

Dashboard recent lists contain at most five albums and five media, with at most
three thumbnails per item/cover. Upload-session pages default to 25 files and cap
at 100; session state uses a status grouping instead of loading all file rows.
The category tree endpoint is an explicit exception: it returns the entire
hierarchy from one flat query and builds it iteratively. Use paginated taxonomy
reads for option lists; full trees remain a memory/response-size risk.

Normal image processing generates three thumbnails by default and accepts at
most eight configured sizes. Gallery queries select all persisted thumbnails,
so imported or historical rendition identities can exceed that normal count.
Signed URLs also contribute substantially to payload size. Measure response bytes
with representative renditions before increasing gallery page limits.

## N+1 prevention and joins

Collection repositories use nested, explicit Prisma projections for related
thumbnails and favorite presence. They do not issue service-level detail lookups
for each returned media item. Prisma may implement nested projections with several
batched SQL statements; one `findMany` call is not a promise of one SQL statement.
Measure actual query counts when changing relation loading or upgrading Prisma.

Album-media pages query the membership table, filter live media, and project
their media thumbnails/favorite in the same repository operation. Library album,
category and tag filters use relation existence predicates; they do not load all
membership IDs into JavaScript or multiply the media result by matching joins.
Album detail counts use a grouped media query for one album; album lists do not
compute counts individually for every album.

Batch taxonomy assignment previously locked each media and validated each
taxonomy ID separately. It now performs:

1. The existing taxonomy table lock, protecting targets from concurrent changes.
2. One parameterized `id = ANY($1::uuid[])` live-media query, ordered by UUID
   before `FOR UPDATE` so overlapping batches acquire locks consistently.
3. One ID-only taxonomy lookup for the complete target set.
4. One `createMany` operation with duplicate links skipped.

Input validation deduplicates and sorts IDs and caps each set at 100. This replaces
up to 200 per-ID validation/locking reads with two statements, excluding transaction
and table-lock overhead. A maximum batch still generates up to 10,000 association
rows. All validation and insertion remain in the same transaction; missing/deleted
targets reject the entire operation. Repositories always use the injected transaction
client. Table locks still serialize taxonomy mutations and assignments.

Category parent validation follows one ancestor at a time under that lock. It is
a write-time hierarchy walk, not a collection-read N+1, but extremely deep trees
still incur one lookup per ancestor. A recursive SQL traversal should only replace
it with tests preserving cycle detection and concurrent reparent protection.

## Cursor correctness

| Collection         | Ordering and continuation                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media              | `(createdAt, id)`, `(originalFilename, id)`, or `(takenAt, id)` in matching directions. Cursors contain both values; predicates compare the sort value and UUID tie-breaker. |
| Capture-date media | Explicit `NULLS LAST` in either direction. Non-null continuation includes the null partition; a null cursor continues only within that partition by UUID.                    |
| Trash              | `(deletedAt DESC, id DESC)`; continuation uses encoded values without looking up the anchor.                                                                                 |
| Album media        | `(position ASC, membershipId ASC)` scoped to an album; cursors validate album and filter identity. Equal positions remain deterministic.                                     |
| Cleanup            | `(deletedAt ASC, id ASC)` batches of 50, advancing past failures so one broken object does not starve later candidates.                                                      |
| Upload files       | `(createdAt ASC, id ASC)` with a Prisma ID cursor; the anchor must still exist in that session and is validated before use.                                                  |

Media/trash value cursors continue even if the anchor row is deleted. Media cursor
version 1 binds ordering, not the complete filter set; callers must discard the
cursor when filters change. Album-media cursors bind their filters. Separate page
requests do not share a database snapshot: concurrent filename/date/position changes
can move rows across a boundary. Keyset pagination guarantees deterministic ties
for stable data, not snapshot traversal under arbitrary concurrent edits. Clients
deduplicate IDs and reset pagination after relevant filter changes.

Integration coverage walks media in both directions with equal timestamps,
filenames and null capture dates, exercises combined membership/favorite/search
filters, and checks album/trash ordering and deleted anchors.

## Existing index coverage

The schema and committed migrations are the source of truth. Unique constraints
already create indexes; do not add duplicates for primary keys or unique lookups.

| Access path                     | Existing coverage                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active creation-ordered media   | `(deletedAt, createdAt, id)`; reverse scan supports descending order.                                                                                                                                                                       |
| Active status/type and creation | `(deletedAt, status, createdAt, id)` and `(deletedAt, type, createdAt, id)`. Other simultaneous filters may remain residual predicates.                                                                                                     |
| Active filename ordering        | `(deletedAt, originalFilename, id)`. This does not accelerate arbitrary case-insensitive substring matching.                                                                                                                                |
| Capture-date ordering           | `(deletedAt, takenAt, id)` for ascending/null-last; SQL-managed partial `(taken_at DESC NULLS LAST, id DESC) WHERE deleted_at IS NULL` for descending/null-last.                                                                            |
| Trash/retention                 | `(deletedAt, id)`.                                                                                                                                                                                                                          |
| Album lists                     | `(deletedAt, createdAt, id)` and `(deletedAt, visibility, createdAt, id)`. Name ordering currently requires sorting.                                                                                                                        |
| Ordered album memberships       | `(albumId, position, id)`; unique `(albumId, mediaId)`; reverse `(mediaId, albumId)` for media membership reads.                                                                                                                            |
| Tag/category memberships        | Unique `(mediaId, tagId/categoryId)` plus reverse `(tagId/categoryId, mediaId)` for taxonomy-filtered reads.                                                                                                                                |
| Thumbnail/variant reads         | Unique `(mediaId, type, format, name)` has the relevant leading media/type prefix. Width/ID ordering may sort the small rendition set.                                                                                                      |
| Favorites                       | Unique `(userId, mediaId)` for personal presence/absence and mutations; `(userId, createdAt, id)` and media lookup indexes are present.                                                                                                     |
| Checksum duplicate lookup       | `(checksum, createdAt, id)` seeks the digest and chooses the oldest UUID-tied match. `deletedAt` and excluded ID are residual predicates.                                                                                                   |
| Taxonomy                        | `(parentId, name, id)` for children; `(createdAt, id)` for lists; primary/unique indexes for ID/slug.                                                                                                                                       |
| Upload files                    | `(uploadSessionId, status, createdAt, id)` supports session/status grouping and counts; status/history and media/duplicate-reference indexes also exist. Session pagination has no exact matching `(uploadSessionId, createdAt, id)` index. |

No index changes were made during this review. Correctness tests and query shapes
justify the current primary access paths, but do not provide representative
large-library plans sufficient to justify additional write/storage costs.

Candidates to evaluate with workload evidence, rather than add automatically:

- `(uploadSessionId, createdAt, id)` if large-session polling spends time sorting
  rows; `status` between session and timestamp in the existing index prevents a
  simple ordered session scan across all statuses.
- `(deletedAt, name, id)` for frequent name-sorted album pages.
- `(deletedAt, mimeType, createdAt, id)` for selective MIME filters that scan too
  many active media. Avoid a composite index for every filter combination.
- PostgreSQL `pg_trgm` indexes for the specific filename, taxonomy name and album
  name/description columns whose substring scans dominate measured plans.
  Preserve escaped literal `ILIKE` semantics; full-text search is a different
  matching contract, and very short search terms still need measurement.
- A more selective checksum index only if many deleted copies of the same digest
  measurably slow active duplicate detection.

Schema and SQL migrations must change together where Prisma can represent the
index. Preserve SQL-only null-ordering/partial indexes and never edit an applied
migration. Plan production index creation around table size and lock impact.

## Checksum and favorite lookup

Checksums are SHA-256 of original bytes, not ETags or resized files. Digest lookup
uses `findFirst` with `(createdAt ASC, id ASC)`, excludes the current media, and
excludes soft-deleted matches by default. Detection and checksum reservation run
under a transaction-scoped advisory lock for that checksum. Accepted duplicates
remain separate identities; no unique checksum constraint is added.

The checksum helper accepts streams, but the current image worker supplies a
fully buffered original because Sharp also needs it. Original hashing still
consumes CPU proportional to file size. Favorite filters use indexed relation
existence/absence; personal favorite identity is one row per user/media pair. Mutations lock
live media and use idempotent insertion/deletion without scanning all favorites.

## Dashboard, storage aggregates and caching

Dashboard aggregation is one SQL statement. It groups optimized variant sizes by
media before joining, avoiding inflated counts/original bytes from multiple
renditions. Active media determine library totals; the optimized subquery currently
groups optimized variants across the library, including trash. Counts/sums still
require scanning data and can become expensive with millions of records.

The existing instance-local summary reader caches only aggregate metadata for
30 seconds and shares an in-flight refresh. Recent lists and signed URLs refresh
on every request. Multiple API processes each have an independent cache; mutations
do not actively invalidate it. Aggregate timestamps expose this freshness policy.
Failures are not cached and expired data is not silently returned.

Storage settings use a separate, uncached SQL aggregate over all persisted variants,
including trash. They never enumerate the storage bucket. BigInt/decimal-string
totals preserve byte precision without loading all variant objects into Node.

Keep this simple strategy until aggregate latency and request frequency justify
change. First measure plans, refresh overlap and staleness requirements. Only then
consider a shared summary or background-maintained counters with an explicit
reconciliation design. No Redis query cache, result cache, or materialized summary
was introduced by this review.

## Signed URL overhead

Storage and signing clients are created once per process owner. The S3 adapter
signs download commands using configured credentials; gallery signing does not
perform an object `HEAD`/`GET` or fetch image bytes. Originals have a dedicated
explicit endpoint and are never automatically signed by collection reads.

Signing cost scales with the returned thumbnail count. Collection services sign
only actual page rows with `Promise.all`. This is bounded by the page and its
persisted variants, rather than the library, but there is no separate signing
concurrency limiter. Raising page/variant counts raises CPU and promise allocation.

Dashboard responses now share signing promises by storage key within a single
response, so the same thumbnail used by multiple album covers/recent media is
signed once. The map is discarded after that request: future requests still sign
fresh URLs. This removes duplicate work without caching expiring URLs across
requests. Signature errors still fail through centralized handling.

## Worker concurrency and memory

Media processing runs in a dedicated BullMQ process, outside upload requests.
`QUEUE_WORKER_CONCURRENCY` defaults to 1 and is validated from 1 to 32 per worker.
Multiple worker processes multiply that concurrency. Start at the default and
increase only after measuring resident memory, CPU, queue latency and database
acquisition/transaction latency with representative originals.

Sharp processes one rendition at a time within each job and limits decoded input
to 100 million pixels. This prevents all renditions from decoding simultaneously,
but original bytes, snapshot copies, native decoding memory and completed rendition
buffers coexist. All generated rendition buffers are retained until persistence.
The default upload file limit is 100 MiB, configurable up to 5 GiB; that upper
limit is not a promise that the current buffered image worker can handle it safely
at high concurrency. Checksum work and native image processing can also delay job
completion/lock renewal under CPU pressure.

State transitions and checksum admission use transactions; image transformations
occur outside them. Some existing object operations intentionally occur under
database locks: upload completion checks/copies the source while holding session/
file locks, and rendition persistence checks/uploads under a media lock. Slow object
storage can occupy a pool connection and extend lock duration. Moving this IO
requires preserving immutable originals, concurrent deletion safety and retry
recovery, so it was not rewritten during this review.

Cleanup has a dedicated queue and hourly schedule. It reads candidates in batches
of 50 and purges sequentially within a job using durable markers/manifests. Failed
jobs remain in Redis for inspection; completed producer jobs retain at most 1000.
Failed-job history is unbounded and needs operational monitoring/pruning policy.

## Redis and Prisma connection ownership

The API producer constructs one reusable ioredis client and one Queue per owner;
`ready()` shares its initialization promise. Enqueue operations reuse that queue.
Producer retries are bounded, the offline queue is disabled, and commands have a
timeout. There is no new Redis connection per upload or HTTP request.

Each dedicated Worker is created once and owns persistent command/blocking Redis
connections, with `maxRetriesPerRequest: null`. Cleanup scheduler queue connections
are separately owned and reused. Blocking worker connections must not be collapsed
into the producer connection just to reduce the connection count; see
[BullMQ connection requirements](https://docs.bullmq.io/guide/connections).
Shutdown drains workers, closes scheduler/queues, and releases their clients.

Only database infrastructure constructs Prisma and the PostgreSQL adapter. API,
each worker and each script own one client/pool and inject it into repositories;
transactions pass their scoped client through repository composition. Connect and
disconnect are idempotent, startup checks `SELECT 1`, and acquisition timeout is
five seconds. No client/pool is created per request or repository call.

Reuse does not mean unlimited capacity: total connections scale with API/worker
process count and adapter pool limits. A `Promise.all` within an interactive
transaction shares one transaction connection and should not be counted as SQL
parallelism. Budget pool capacity against PostgreSQL limits and observe waiting
transactions before introducing a pooler or raising worker concurrency.

## Measurement and regression checks

This review verified behavior using repository/service tests and isolated PostgreSQL
and Redis integration tests, not production-sized benchmarks. No representative
large-library `EXPLAIN (ANALYZE, BUFFERS)` or heap/CPU profiles were collected, so
latency improvements are not claimed from synthetic correctness fixtures.

Before introducing an index or persistent cache, measure representative active/
trashed libraries, memberships, rendition counts and filter selectivity. Inspect:

- Actual SQL count per request and response bytes as page size increases.
- Plans/buffers for first and late cursor pages, rare tags/categories/favorites,
  combined filters, literal substring search and null capture dates.
- Sort/scan costs for late offset pages and upload-session pages across statuses.
- Aggregate scan time, hash/group spill, cache refresh frequency and API replica count.
- Signature CPU/time, worker RSS/native memory, queue depth, failed-job retention,
  database pool waits and Redis connection counts.

Use `EXPLAIN (ANALYZE, BUFFERS)` on representative staging reads; it executes the
query. Match production predicates, ordering and parameter types, run `ANALYZE`
after loading fixtures, and compare cold/warm behavior. Do not disable sequential
scans to manufacture index use. PostgreSQL's
[index guidance](https://www.postgresql.org/docs/17/indexes.html) and
[EXPLAIN guide](https://www.postgresql.org/docs/17/using-explain.html) describe the
tradeoffs and measurement workflow.

Default verification: `npm test --workspace @album-manager/api`.
Opt-in external-service verification:
`DATABASE_TESTS=1 QUEUE_TESTS=1 npm test --workspace @album-manager/api`.
Database tests use random isolated schemas and roll back fixtures; Redis tests use
unique prefixes and clean up their own jobs. Storage integration remains separately
opt-in via `STORAGE_TESTS=1`.

Review verification results:

- Default backend suite: 617 passed, 113 external-service tests skipped.
- PostgreSQL/Redis-enabled backend suite: 729 passed, one storage test skipped.
- Backend ESLint, changed-file formatting and diff whitespace checks passed.
- The integration run emitted a `pg` deprecation warning about concurrent queries
  on one client. Transaction-scoped `Promise.all` paths are serialized by the
  database; keep this warning visible when evaluating a future `pg` major upgrade.
  This review does not change database transaction scheduling.
