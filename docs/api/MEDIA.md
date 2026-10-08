# Media list

See [Media detail and original URLs](MEDIA_DETAIL.md) for individual media,
EXIF, display renditions, and explicitly requested original access.
See [Favorite mutations](MEDIA_FAVORITES.md) for adding and removing favorites.
See [Media trash](TRASH.md) for soft deletion, restore and permanent deletion.

`GET /api/media` returns a compact, cursor-paginated gallery list. The MVP is
single-user. Soft-deleted media is always excluded. No EXIF, original object
URLs, storage keys, or preview URLs are returned.

```json
{
    "items": [
        {
            "id": "a0000000-0000-4000-8000-000000000001",
            "type": "IMAGE",
            "originalFilename": "photo.jpg",
            "width": 4000,
            "height": 3000,
            "aspectRatio": 1.3333333333333333,
            "favorite": false,
            "takenAt": "2026-10-01T12:00:00.000Z",
            "thumbnails": [
                {
                    "name": "thumbnail-200",
                    "format": "webp",
                    "width": 200,
                    "height": 150,
                    "url": "https://storage.example/signed-thumbnail-url"
                }
            ]
        }
    ],
    "nextCursor": "opaque-base64url-cursor",
    "hasMore": true
}
```

Dimensions, aspect ratio, and taken date can be null. `thumbnails` is empty when
no thumbnail has been generated. Thumbnail URLs are signed through the storage
provider and expire; refetch the list to renew them. Original and preview
variants are never selected or signed by this endpoint.

## Query parameters

All parameters are optional, scalar, and validated. Repeated parameters,
unknown parameters, malformed values, and reversed date ranges return HTTP 400
through centralized error handling. Enum values are case-sensitive.

| Parameter                      | Meaning                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`                        | Integer 1 through configured maximum; default 50 (or the maximum if below 50).                                                                                       |
| `cursor`                       | Opaque cursor from the previous response.                                                                                                                            |
| `sort`                         | `createdAt` (default), `takenAt`, or `filename`.                                                                                                                     |
| `order`                        | `desc` (default) or `asc`.                                                                                                                                           |
| `q`                            | Case-insensitive literal substring in filename, tag/category names, or active album name/description; trimmed, 1–255 characters. `%` and `_` are literal characters. |
| `type`                         | `IMAGE` or `VIDEO`.                                                                                                                                                  |
| `status`                       | `PENDING`, `PROCESSING`, `READY`, or `FAILED`. No status is assumed when omitted.                                                                                    |
| `favorite`                     | `true` or `false`, matching presence/absence of the favorite relation.                                                                                               |
| `category`                     | Category UUID.                                                                                                                                                       |
| `tag`                          | Tag UUID.                                                                                                                                                            |
| `album`                        | Active album UUID; deleted albums never match.                                                                                                                       |
| `takenAtFrom`, `takenAtTo`     | Inclusive taken-date bounds; exclude null taken dates.                                                                                                               |
| `createdAtFrom`, `createdAtTo` | Inclusive creation-date bounds.                                                                                                                                      |
| `mimeType`                     | Exact MIME type, normalized to lowercase.                                                                                                                            |

Date bounds require ISO timestamps with seconds and an explicit timezone
(`Z` or numeric offset), with at most three fractional digits. For example,
`2026-10-01T00:00:00Z`. Use `URLSearchParams` to encode query values including
numeric timezone offsets. Filters combine with AND; text-search fields combine
with OR. Category filtering matches the specified category, not descendants.

## Pagination and ordering

Every sort orders by the selected field followed by `id`, both in the requested
direction. `takenAt` nulls are always last; its null partition orders by `id`.
Filename ordering uses the database's native collation. It is not natural or
case-insensitive sorting.

The versioned base64url cursor encodes sort field, direction, exact sort value
(including null), and ID. It is opaque to clients, not signed or an authorization
mechanism. Incompatible sort/direction or malformed cursors return HTTP 400.
Keep filters and ordering unchanged between pages; reset the cursor when they
change. The page size may change between requests.

Queries use value-based keyset comparisons, fetch `limit + 1`, and return a cursor
for the last returned row only when more rows exist. On the final or empty page,
`nextCursor` is null and `hasMore` is false. Pagination survives deletion of the
anchor row and avoids offset scans. It is not a snapshot: concurrent updates to
sort values or filters can move rows between pages; newly inserted rows before
the cursor appear after refreshing from the first page.

## Configuration and query efficiency

`MEDIA_LIST_MAX_LIMIT` defaults to 200 and accepts integers 1–1000.
`MEDIA_LIST_URL_EXPIRY_SECONDS` defaults to 900 and accepts integers 1–3600.
Both are validated at startup. See `.env.example`.

The list repository selects only gallery fields, the selected ordering value,
favorite presence, and compact thumbnail descriptors. It does not count the
collection, fetch EXIF, fetch all variants, or make per-item media queries.
Existing relation indexes support membership filters. The media-list migration
adds filename ordering and an explicit descending/null-last taken-date index.
Substring search may scan matching text; it uses Prisma filters rather than
unsafe SQL. At larger search workloads, review query plans before adding a
dedicated text-search index or changing the documented search semantics.

Tests:

```sh
npm test --workspace @album-manager/api -- src/modules/media/routes/media.routes.test.js src/config/mediaList.test.js
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/mediaList.integration.test.js
```

The integration suite creates an isolated schema, applies migrations there,
rolls back fixtures, and drops its schema. It never modifies application media.
