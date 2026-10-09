# Dashboard summary

`GET /api/dashboard` returns a single-user library summary. It takes no query
parameters; unsupported parameters receive the centralized HTTP 400 response.
The route is registered when the application has a database (or an injected
dashboard service in tests). No storage or queue connection is required.

```json
{
    "counts": {
        "media": 120,
        "albums": 8,
        "categories": 6,
        "tags": 20,
        "processingMedia": 2,
        "failedMedia": 1
    },
    "storage": {
        "originalBytes": "1200000000",
        "optimizedBytes": "300000000",
        "estimatedSavedBytes": "600000000"
    },
    "summaryUpdatedAt": "2026-10-09T00:00:00.000Z",
    "recentAlbums": [
        {
            "id": "a0000000-0000-4000-8000-000000000001",
            "name": "Trip",
            "slug": "trip",
            "visibility": "PRIVATE",
            "createdAt": "2026-10-08T12:00:00.000Z"
        }
    ],
    "recentMedia": [
        {
            "id": "b0000000-0000-4000-8000-000000000001",
            "type": "IMAGE",
            "originalFilename": "photo.jpg",
            "status": "PROCESSING",
            "width": null,
            "height": null,
            "createdAt": "2026-10-08T12:00:00.000Z"
        }
    ]
}
```

## Meaning and storage precision

Media and album counts exclude soft-deleted rows. Categories and tags use their
existing permanent-deletion semantics. `processingMedia` counts exactly
`PROCESSING`; `failedMedia` counts exactly `FAILED`. Pending media are included
in the total, but not the processing count.

`originalBytes` sums the recorded original `Media.fileSize` of active media.
`optimizedBytes` sums every `OPTIMIZED` variant belonging to active media; it
excludes originals, previews, thumbnails and blur placeholders. These are metadata
totals, not a bucket usage audit: trash, untracked objects and incomplete upload
objects are excluded. Originals remain stored, so estimated savings do not
represent bytes physically reclaimed from storage.

`estimatedSavedBytes` sums `max(original size - sum of optimized variant sizes, 0)`
per active media item with at least one optimized variant. Unoptimized items
contribute zero. Multiple formats count toward optimized storage but never
multiply the original size or the media count. Larger optimized output contributes
zero savings. Byte totals are decimal strings to preserve values above JavaScript's
safe integer range; an empty library returns `"0"` for every byte total.

## Query cost and freshness

The repository computes all aggregates in one SQL statement, grouping optimized
variants before joining media. Counts and original sizes cannot be inflated by
multiple variants; all aggregates share one statement snapshot.

The service caches aggregates for 30 seconds per application instance and shares
one in-flight refresh across concurrent requests. A refresh runs on the first
request or after expiry. Failures are not cached and expired data are not returned;
errors use centralized handling. `summaryUpdatedAt` identifies when that aggregate
snapshot was loaded. Mutations can take up to 30 seconds to appear in counts.

The two recent lists are fetched fresh on each request and each contains at most
5 active records, ordered by `(createdAt DESC, id DESC)` using existing indexes.
Recent media means newest persisted media, including pending/failed processing,
not upload sessions or duplicate attempts. Recent lists may therefore be newer
than the aggregate snapshot. They select compact metadata only: no originals,
signed URLs, storage keys, EXIF, descriptions, or unbounded relations.

`createDashboardService` accepts an asynchronous `summaryReader` returning
`{ data, updatedAt }`, where `data` uses the repository aggregate contract and
`updatedAt` is a Date. Module composition also accepts this reader. A future shared
cache or background-maintained summary can replace the instance-local reader
without changing the route, response mapper, or recent-list queries. Aggregate
queries scan recorded metadata only once per refresh, rather than every request.

## Tests

Run focused unit/HTTP tests with:

```sh
npm test --workspace @album-manager/api -- src/modules/dashboard
```

Run PostgreSQL integration tests against isolated schemas with:

```sh
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/dashboard/repositories/dashboard.integration.test.js
```
