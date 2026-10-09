# Optional semantic search

Metadata search (`GET /api/media?q=...`) retains its existing filename, taxonomy and
album matching. Semantic search is a separate backend module, activated only when
an embedding provider is configured. No AI SDK or model is selected by the application.

## Enable and operate

1. Generate the Prisma client and deploy migrations using `npm run db:generate` and
   `npm run db:deploy`. The additive migration creates `semantic_indexes`; it does
   not change media IDs, storage keys or existing taxonomy.
2. Implement a local server-only adapter exporting `createSemanticProviders({ environment })`.
   Set `SEMANTIC_PROVIDER_MODULE` in the root `.env` to its `.js`/`.mjs` path (relative
   to the repository root or absolute). This is administrator-controlled executable
   configuration. Do not place provider credentials in frontend environment variables.
3. Restart the API and run `npm run worker:semantic --workspace @album-manager/api`.
   The independent `semantic-indexing` BullMQ queue reconciles up to 50 images every
   minute. The first pass backfills existing ready images; later passes discover uploads
   and changed sources without hooks in upload, album or media-processing services.
4. Use the endpoints below. Omitting the module setting leaves semantic routes
   unregistered; the standard API and media workers continue to work.

The adapter factory returns:

```js
{
    embeddingProvider: {
        profile: {
            space: 'your-shared-image-text-space-v1',
            model: 'exact-model-and-preprocessing-version',
            dimensions: 512,
        },
        async embedImage({ bytes, mimeType, signal }) { /* return number[] */ },
        async embedText(text, { signal }) { /* return number[] */ },
    },
    // Optional; independent from the embedding provider/vendor:
    tagProvider: {
        revision: 'your-tag-model-and-prompt-v1',
        async tagImage({ bytes, mimeType, signal }) { /* return [{ label, confidence }] */ },
    },
}
```

This is an interface example, not a functioning model. Supply real encoders with a shared
image/text embedding space; arbitrary text and image models are not interchangeable.
Space, model and tag revision allow 1–128 letters/digits/underscore/period/colon/hyphen.
Dimensions must be 1–4096. Encoders return finite, nonzero numeric arrays; the service
normalizes them. Each provider call has a 30-second deadline; honor the supplied
AbortSignal to cancel vendor work when that deadline expires. Tag outputs contain up to 100 labels (1–128 characters) with confidence
between 0 and 1. Adapter factories should return stateless providers; they own any vendor
client/resource lifecycle. A provider swap must use a new versioned space when coordinates
change. Changing model or tag revision also triggers reconciliation. A new space can be
indexed alongside the old one; old records remain until explicitly retired or media is purged.

For programmatic composition, pass `semanticProviders` to `buildApp`, or pass
`providers` to `startSemanticIndexingWorker`. Tests may inject `semanticSearchService`.
`createSemanticSearchModule` also accepts a `vectorIndex` with `search({ profile, vector,
excludeId, limit, cursor })`. It must enforce current live-media/checksum/profile filters,
order by score descending then UUID ascending, and honor the score/ID cursor. Replacing
this search adapter does not change media storage or provider interfaces; an external
index requires its own synchronization and deletion mechanism.

## HTTP contracts

All endpoints use the existing authenticated shared-library policy. POST also requires
the existing CSRF header. Album visibility is metadata under the current auth model.

| Endpoint                                | Input                            | Output                                         |
| --------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `POST /api/semantic-search`             | JSON `{ text, limit?, cursor? }` | `{ items: [{ id, score }], nextCursor }`       |
| `GET /api/media/:mediaId/similar`       | Query `limit`, `cursor`          | Same result; excludes source image             |
| `GET /api/media/:mediaId/semantic-tags` | Existing media UUID              | `{ mediaId, tags, space, model, tagRevision }` |

Text is trimmed, nonempty and at most 2000 characters. Limit defaults to 20 and is
bounded to 1–100. Unknown search fields and malformed IDs/cursors are rejected (400).
An unavailable/incompatible source index returns 409; missing, trashed, non-ready or
purging source images return 404. Provider failures return a sanitized 503 through the
centralized error handler. Results expose no vectors, original bytes, storage keys or
credentials. Resolve returned media IDs through the existing media APIs for display.

Pagination is keyset-based and bound to text/source, normalized vector and embedding
profile. Reuse identical input and a deterministic provider for successive pages.
Concurrent reindexing can change results; this API does not provide snapshot pagination.
Scores are cosine similarities, not probabilities or universal relevance thresholds.

## Persistence, deletion and failures

Each `(media_id, space)` record stores profile, source SHA-256, normalized vector,
generated tags, tag revision, status, safe failure code and timestamp. Generated tags
remain separate from manual `Tag`/`MediaTag` assignments and metadata search.

Indexing reads the existing original through the storage provider and never writes
objects. Provider failures produce independent FAILED records and do not change media or
upload statuses. Failed records are retried after five minutes; reconciliation continues
with other images. Fresh/stale records are selected before retrying failures; eligible
failures are ordered by their oldest attempt so low UUID failures cannot monopolize backfill. Queue transport failures use three exponential retries. Successful
records are reused when checksum and all model revisions match. Durable discovery recovers
from crashes between processing completion and AI indexing; there is no dual-write enqueue.

Publishing locks the media row and rechecks readiness, deletion state and checksum.
A stale in-flight result cannot recreate a purged record or publish for a changed source.
A duplicate failed attempt cannot erase a successful record for the same source/profile.
Search joins current media rows, excludes trash and stale checksums immediately, and only
compares the active space/model/dimensions. Restore can reuse an unchanged index. The
foreign key cascades permanent deletion without adding AI logic to media purge services.

## Performance and verification

The initial PostgreSQL adapter performs exact cosine search in the database using float
arrays. It needs no PostgreSQL extension, bounds responses, and avoids loading the entire
index into Node.js memory. It still scans matching vectors; large libraries should use a
purpose-built vector index. Workers currently buffer originals using the existing storage
interface. Keep worker concurrency conservative and choose providers suited to your image
size limits. Video embeddings are not implemented.

Run the ordinary suite with `npm test`; semantic integration tests are opt-in:

```sh
DATABASE_TESTS=1 npm run test --workspace @album-manager/api -- src/modules/semantic-search/repositories/semantic.integration.test.js
```

These use a temporary schema and roll back fixtures. They verify known-vector ranking,
equal-score pagination, live/checksum filtering, CAS publishing, failed-attempt protection,
reconciliation and cascade deletion.
