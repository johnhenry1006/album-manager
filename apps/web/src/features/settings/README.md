# Settings feature

Pages and page hooks import only from `@/features/settings/index.js`:

```js
import {
  useImageOptimizationSettings,
  useUpdateImageOptimizationSettings,
  useStorageSettings,
} from '@/features/settings/index.js';
```

`useImageOptimizationSettings()` returns the TanStack query for
`GET /api/settings/image-optimization`. `useUpdateImageOptimizationSettings()`
returns a mutation; call `mutate` or `mutateAsync` with a partial settings object.
PATCH input validation belongs to the backend. On success the hook cancels stale
reads, caches the complete validated response, and invalidates only the exact
image-settings query to refresh mounted consumers. Failed mutations preserve
cached settings. No optimistic changes are made.

`useStorageSettings()` queries `GET /api/settings/storage`. It validates and caches
only public `providerType`, `bucketName`, `endpointHost`, `objectCount`, and the
decimal-string byte fields `originalBytes`, `optimizedBytes`, `variantBytes`,
`totalBytes`, and `estimatedSavedBytes`. Unavailable metadata/counts may be null.
Credentials, endpoint URLs, nested configuration, and unknown fields are excluded
before caching. Invalid known fields produce a safe `INVALID_RESPONSE` error.
This client projection does not replace the backend's obligation to never send secrets.

Image settings responses are validated against the existing backend contract and
projected onto its public fields before entering query or mutation caches. Raw
responses are never attached to validation errors. Pure response handling lives
in the feature's private `utils/settingsResponse.js`; `settingsApi.js` contains
HTTP calls only. The public index exports hooks and `settingsQueryKeys`, without
exposing the private API adapter or response utilities.

Both reads forward query cancellation signals to the shared HTTP client. Hooks
inherit shared defaults: 30-second freshness, five-minute cache retention, no
automatic retries, and no refetch on window focus. Storage and image settings
have distinct keys under `['settings']`. The storage page hook composes `useStorageSettings` through the public index and
owns refresh state. The page displays provider, bucket and byte totals using shared
BigInt formatting, plus object count when available. It retains data after failed
refreshes. The image optimization page composes the public read and update hooks.

Run `npm test --workspace @album-manager/web -- src/features/settings` to verify
requests, cache sharing and updates, cancellation, errors, response validation,
and exclusion of unexpected credentials from query and mutation results.
