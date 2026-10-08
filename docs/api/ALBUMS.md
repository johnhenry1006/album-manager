# Albums

The single-user album module manages collections of existing media. Album
membership is many-to-many; adding/removing membership never modifies the
original media or its stored files. All external input is validated; unknown
fields, invalid UUIDs, malformed bodies/queries and incompatible cursors return
400 through centralized error handling. Missing/deleted albums and missing
members return 404; slug conflicts return 409. Unexpected failures return 500
without database/storage details.

## Routes

| Method | Route                                 | Behavior                                        |
| ------ | ------------------------------------- | ----------------------------------------------- |
| GET    | `/api/albums`                         | Paginated album search                          |
| POST   | `/api/albums`                         | Create an album; 201                            |
| GET    | `/api/albums/:albumId`                | Album detail with live media counts             |
| PATCH  | `/api/albums/:albumId`                | Change metadata or cover                        |
| DELETE | `/api/albums/:albumId`                | Soft-delete album; 204                          |
| GET    | `/api/albums/:albumId/media`          | Ordered, cursor-paginated gallery               |
| POST   | `/api/albums/:albumId/media`          | Idempotently add/reposition existing media; 200 |
| DELETE | `/api/albums/:albumId/media/:mediaId` | Remove membership; 204                          |

## Album metadata and counts

Creation requires `name` (trimmed, 1–255 characters; no newline or NUL).
Optional fields: `slug` (1–255 lowercase ASCII letters/digits separated by
single hyphens), `description` (nullable, up to 5000 characters, no NUL),
`visibility` (`PRIVATE`, the default, or `PUBLIC`), `coverMediaId` (null on
creation). When omitted, slug is generated from name with a UUID suffix.
Slugs remain globally reserved after soft deletion. Visibility is metadata,
not an authentication/access-control mechanism.

PATCH accepts the same fields, including a UUID or null for `coverMediaId`.
An empty PATCH is invalid. Set/change/clear cover with PATCH; a non-null cover
must be live media already belonging to the album. Add membership first.
Removing the cover member clears the cover in the same transaction. If the
media is subsequently soft-deleted elsewhere, album responses show a null
cover and counts/gallery exclude it.

Create/PATCH/list items return explicit album metadata:

```json
{
    "id": "a0000000-0000-4000-8000-000000000001",
    "name": "Summer trip",
    "slug": "summer-trip",
    "description": null,
    "visibility": "PRIVATE",
    "coverMediaId": null,
    "createdAt": "2026-10-08T12:00:00.000Z",
    "updatedAt": "2026-10-08T12:00:00.000Z"
}
```

Detail additionally includes `counts: { "media": 12, "images": 10, "videos": 2 }`.
Counts include every live member, regardless of processing status. Detail
metadata and counts are read from a consistent transaction snapshot.

## Album list

Optional scalar query parameters:

| Parameter    | Meaning                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `page`       | Positive integer, default 1; offset must fit a PostgreSQL integer                                              |
| `limit`      | Requested integer 1–200, default 50; capped to `MEDIA_LIST_MAX_LIMIT`. Pagination returns the effective limit. |
| `q`          | Trimmed literal substring in name or description; 1–255 characters, case-insensitive, no newline or NUL        |
| `visibility` | `PRIVATE` or `PUBLIC`; omitted means all active albums                                                         |
| `sort`       | `newest` (default), `oldest`, or `name`; unknown values are rejected                                           |

Newest sorts by `(createdAt DESC, id DESC)`, oldest by `(createdAt ASC, id ASC)`,
and name by `(name ASC, id ASC)` using the database collation. Visibility and
search apply before pagination and to the matching total. `%`, `_` and backslashes are searched
literally. Deleted albums never appear. List returns lightweight metadata and
`pagination`; it does not load all memberships or calculate per-album counts.

```json
{
    "items": [],
    "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 }
}
```

Page and matching total use a consistent snapshot. Out-of-range pages return
empty items and the matching total. Offset pagination is not a snapshot across
requests; inserts/deletions can move rows between pages.

## Album media and ordering

POST body is `{ "mediaId": "<UUID>", "position": 5 }`. `position` is optional
and must be an integer from 0 through 2147483647. A new member without an
explicit position appends after the highest existing membership position
(including memberships whose media has been soft-deleted). If the highest
position is already 2147483647, automatic append returns 400.

Repeating a member assignment preserves its membership ID and current position
unless `position` is explicitly supplied. Explicit assignment can reposition
an existing member. Gaps and ties are allowed; other members are not shifted.
Mutations are serialized by a transaction lock on the album; referenced media
is locked while liveness is checked.

POST returns:

```json
{
    "membershipId": "c0000000-0000-4000-8000-000000000001",
    "albumId": "a0000000-0000-4000-8000-000000000001",
    "mediaId": "b0000000-0000-4000-8000-000000000001",
    "position": 5,
    "createdAt": "2026-10-08T12:00:00.000Z"
}
```

GET accepts only `limit` (1 through the lesser of 200 and `MEDIA_LIST_MAX_LIMIT`)
and `cursor`. Its default is 50, clamped to that maximum; explicit oversized media
limits are rejected. Album list pagination instead caps valid requested sizes.
It sorts `(AlbumMedia.position ASC, AlbumMedia.id ASC)` and fetches `limit + 1`.
Items use the [compact media gallery contract](MEDIA.md), with additional
`membershipId` and `position`. Only thumbnails are selected and signed through
the storage provider; no originals, EXIF, storage keys or preview URLs are
returned. Thumbnail expiry uses `MEDIA_LIST_URL_EXPIRY_SECONDS` (default 900).

Response: `{ "items": [], "nextCursor": null, "hasMore": false }`.
The versioned base64url cursor contains album ID, position and membership UUID.
It is opaque to clients, not signed or an authorization mechanism. Malformed
cursors and cursors for another album return 400. Value-based comparisons
continue after removing the anchor membership. On the final/empty page,
`nextCursor` is null. Pagination is not a snapshot during concurrent insertion
or reordering; refresh the first page to see items moved before the cursor.

## Deletion and verification

DELETE album sets `deletedAt`; all subsequent album operations return 404.
Media, memberships, covers and stored files remain persisted. There is no
restore or permanent-deletion endpoint in this module. DELETE membership
physically removes only the association; missing associations return 404.

No schema migration is needed: existing models, constraints and
`(albumId, position, id)` indexes support these queries. Substring search can
scan text; review query plans before adding a search index at larger scale.

```sh
npm test --workspace @album-manager/api -- src/modules/albums
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/albums/repositories/album.integration.test.js
```

Database tests use an isolated temporary schema, rolled-back fixtures and
explicitly scoped committed fixtures for concurrent transaction tests. They
never modify application albums/media.
