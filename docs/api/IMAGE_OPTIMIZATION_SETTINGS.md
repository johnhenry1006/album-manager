# Image optimization settings

`GET /api/settings/image-optimization` returns the complete global settings object.
`PATCH /api/settings/image-optimization` accepts a nonempty JSON object containing
any subset of the following fields, and returns the complete updated object (200).
Omitted fields retain their current values. Query parameters and unknown fields
are rejected. This is a single-user application; no user scope is inferred.

| Field                     | Default         | Validation                                        |
| ------------------------- | --------------- | ------------------------------------------------- |
| optimizationMode          | BALANCED        | LOSSLESS, BALANCED, HIGH_QUALITY, MAX_COMPRESSION |
| optimizedMaxWidth         | 2560            | Integer, 1–16383                                  |
| optimizedMaxHeight        | 2560            | Integer, 1–16383                                  |
| previewMaxWidth           | 1600            | Integer, 1–16383                                  |
| previewMaxHeight          | 1600            | Integer, 1–16383                                  |
| thumbnailSizes            | [800, 400, 200] | 1–8 distinct integers, each 1–16383               |
| outputFormat              | webp            | Only webp is supported by the current processor   |
| balancedQuality           | 80              | Integer, 1–100                                    |
| highQuality               | 90              | Integer, 1–100                                    |
| maximumCompressionQuality | 60              | Integer, 1–100                                    |
| keepOriginal              | true            | Must be the boolean true                          |

```json
{
    "optimizationMode": "HIGH_QUALITY",
    "optimizedMaxWidth": 2400,
    "optimizedMaxHeight": 1800,
    "highQuality": 94
}
```

Optimized and preview images fit inside the configured width/height bounds,
preserve aspect ratio and never upscale. Thumbnail sizes bound both dimensions.
The selected lossy mode uses its corresponding quality; LOSSLESS uses lossless
WebP encoding and ignores the lossy quality fields. Originals remain immutable.

Settings are persisted in the Phase 03 `ApplicationSetting` model under key
`imageOptimization`. Missing rows use defaults without writing on GET. Existing
legacy `mode`, `format`, `optimizedMaxSize` and `previewMaxSize` overrides remain
readable; square limits map to both dimensions. PATCH writes canonical field names
and preserves the existing internal placeholder settings, which are not exposed
through these endpoints. Conflicting legacy/canonical fields fail validation.
No database migration is needed.

A repository-owned transaction takes a PostgreSQL advisory lock by setting key
before reading and updating. It also serializes first-time creation, so concurrent
partial updates retain omitted values. Validation occurs before persistence.
Malformed input returns 400; invalid persisted settings and persistence failures
return a sanitized 500 using the centralized `{ statusCode, error, message,
requestId }` envelope. Invalid persisted settings are never silently replaced.

The worker continues to call `ImageOptimizationSettingsService.getSettings()`
through its injected service abstraction. Each job reads one fresh immutable
snapshot; no HTTP calls or settings cache are involved. Changes affect subsequent
processing attempts. Existing derivatives are not automatically regenerated.

Tests:

```sh
npm test --workspace @album-manager/api -- src/modules/settings src/infrastructure/image-processing
DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/settings/repositories/applicationSettings.integration.test.js
```

The PostgreSQL integration suite creates an isolated schema and verifies actual
persistence and concurrent PATCH merging for absent and existing rows.
