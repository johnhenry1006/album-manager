# Media detail and original URLs

All routes require a session; mutations also require X-CSRF-Token. Favorite flags
and filters belong to the caller; library data remains shared. See [Auth API](AUTH.md).

The authenticated API exposes two read-only endpoints. Both require a media UUID,
reject query parameters, exclude soft-deleted media, and use centralized errors:
400 for invalid input, 404 for missing/deleted media, and sanitized 500 responses
for storage/database failures. Both endpoints send `Cache-Control: no-store`,
including error responses. They never return backend storage configuration,
secret signing credentials, raw storage keys, or upload-session details.

## GET /api/media/:mediaId

Returns an individual media detail object:

| Field        | Content                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core fields  | `id`, `type`, `originalFilename`, `mimeType`, `extension`, `fileSize`, `width`, `height`, `aspectRatio`, `checksum`, `status`, `takenAt`, `createdAt`, `updatedAt`.                  |
| `favorite`   | Boolean representing the authenticated user’s favorite relation.                                                                                                                     |
| `albums`     | Active album memberships with `id`, `name`, `slug`, `description`, `visibility`, `position`, and `addedAt`. Deleted albums are excluded.                                             |
| `categories` | Objects with `id`, `name`, `slug`, and `parentId`.                                                                                                                                   |
| `tags`       | Objects with `id`, `name`, and `slug`.                                                                                                                                               |
| `metadata`   | Stored EXIF fields: `cameraMake`, `cameraModel`, `lens`, `focalLength`, `aperture`, `iso`, `shutterSpeed`, `latitude`, `longitude`, and `rawMetadata`. Null when no metadata exists. |
| `variants`   | All safe display renditions with signed URLs and expiration information, as shown below.                                                                                             |

Byte sizes are decimal strings to preserve 64-bit precision. Dates are ISO UTC
strings. Optional dimensions, aspect ratio, checksum, taken date, and individual
metadata fields can be null. Missing relation collections are empty arrays.
Albums, categories, and tags order by their IDs; variants order by type, width,
then ID so repeated reads have stable collection ordering.

Example display variant:

```json
{
    "id": "a0000000-0000-4000-8000-000000000002",
    "type": "PREVIEW",
    "name": "preview",
    "format": "webp",
    "width": 1600,
    "height": 1200,
    "fileSize": "54321",
    "quality": 80,
    "url": "https://storage.example/temporary-signed-url",
    "expiresIn": 900,
    "expiresAt": "2026-10-08T08:15:00.000Z"
}
```

Display types are `OPTIMIZED`, `PREVIEW`, `THUMBNAIL`, and `BLUR_PLACEHOLDER`.
Formats are the supported media format/extension values: `jpeg`, `jpg`, `png`,
`webp`, `gif`, `avif`, `mp4`, `webm`, and `mov`. Executable formats such as SVG or
HTML are excluded. Safety here refers to registered derivative types and formats;
browser codec support still varies. The repository filters these variants before
fetching keys; the service also checks before signing.

Original descriptors and original URLs are never included in the detail response.
This endpoint does not accept `includeOriginal`; explicitly request an original
through the dedicated endpoint below. Gallery clients should continue using
the [lightweight list endpoint](MEDIA.md) rather than loading detail/EXIF per tile.

## GET /api/media/:mediaId/original-url

Explicitly requests temporary access to the registered immutable original.
Returns 404 if no original variant is registered, even when the media exists.
Only the original key is selected for signing; EXIF and other relations are not
loaded. There is no fallback to previews, upload staging objects, or deleted media.

```json
{
    "url": "https://storage.example/temporary-signed-original-url",
    "method": "GET",
    "expiresIn": 900,
    "expiresAt": "2026-10-08T08:15:00.000Z"
}
```

Use the URL as issued, without modifying its hostname or query. It signs a GET
for downloading the original with a signed Content-Disposition attachment override. It signs a reference without probing object existence,
so an externally removed object may return a storage 404 when the URL is used.

## Expiration policy

- `MEDIA_DETAIL_URL_EXPIRY_SECONDS`: display URLs, default **900 seconds**.
- `MEDIA_ORIGINAL_URL_EXPIRY_SECONDS`: original URLs, default **900 seconds**.
- Each setting accepts integers **1–3600** and is validated at startup. Clients
  cannot override these settings with query parameters.
- `expiresIn` is the configured signing lifetime. `expiresAt` is a conservative
  UTC deadline computed immediately before signing, rounded down to seconds to
  match SigV4 precision. Refresh through the same endpoint for a new URL.
- URLs are bearer capabilities. Do not log or persist them as public metadata.
  Deleting media prevents new URLs; previously issued URLs can remain usable
  until expiry. Object removal, credential invalidation, temporary credential
  expiry, or storage policy can stop access earlier.
- The S3 signature contains the standard access-key identifier and signature;
  it never contains the secret signing key. Storage operations use the existing
  provider abstraction and the configured browser/public endpoint.

## Tests

```sh
npm test --workspace @album-manager/api -- src/modules/media/routes/mediaDetail.routes.test.js src/config/mediaDetail.test.js src/app/mediaDetail.signing.test.js
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/media/repositories/mediaDetail.integration.test.js
```

HTTP tests cover payloads, private-field exclusion, actual network-free SigV4
signing, configured expiry, validation, missing data, and centralized errors.
PostgreSQL tests use isolated schemas and rollback fixtures to verify relation
loading, variant filtering, and soft-deletion behavior without touching application data.
