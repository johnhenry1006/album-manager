# Storage settings statistics

`GET /api/settings/storage` returns a fresh database snapshot of persisted storage
objects. No query parameters are accepted. The MVP follows the application's
single-user policy.

```json
{
    "providerType": "s3",
    "endpointHost": "localhost:9445",
    "bucketName": "album-manager",
    "objectCount": 12,
    "originalBytes": "10000",
    "optimizedBytes": "3000",
    "variantBytes": "3500",
    "totalBytes": "13500",
    "estimatedSavedBytes": "7000"
}
```

All byte values are decimal strings to preserve BigInt precision. `objectCount`
is the number of persisted `MediaVariant` rows; it is `null` if it cannot be
represented as a safe JavaScript integer. Original bytes sum `ORIGINAL` variants;
optimized bytes sum `OPTIMIZED` variants. Variant bytes include **all** non-original
renditions (optimized, preview, thumbnail, and blur placeholder). Total bytes are
original plus variant bytes; optimized bytes are already included in variant bytes.

Estimated saved bytes sum `max(originalBytes - optimizedBytes, 0)` per media
with both original and optimized objects. Unprocessed originals contribute no
savings. Multiple optimized formats are summed, and larger optimized outputs do
not offset savings on other media. Originals remain stored, so this estimates
rendition savings, not reclaimed physical capacity.

Trashed media are included until their persisted variants are permanently removed.
Pending uploads, staging objects, orphaned bucket objects, and external objects
without database records are excluded. These are database metadata totals, not a
bucket inventory or quota measurement.

The settings service reads aggregates through a dedicated repository. Storage
provider metadata is accessed through `getProviderMetadata()` without network
requests or object listings. The S3 provider exposes the public endpoint host
(including any port), falling back to the backend endpoint only when no public
endpoint is configured. Unsafe or unavailable metadata fields are `null`. Only
validated provider identifiers, origin hosts, and bucket names are projected;
configuration, access credentials, object keys, and signed URLs are never returned.

Database/provider failures use centralized sanitized error responses. The route
can be composed with an injected statistics service, or with a database and an
optional storage provider. Missing storage does not prevent database statistics.
