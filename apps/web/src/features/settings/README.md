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

`useStorageSettings()` queries `GET /api/settings/storage`. That backend endpoint
is not implemented yet; its 404 remains a normal query error. It must eventually
return public metadata only. The hook exposes and caches only optional string
fields `driver`, `bucket`, and `region`. Credentials, endpoint URLs, nested
configuration, and unknown fields are excluded before caching. This client
projection does not replace the backend's obligation to never send secrets.

Image settings responses are validated against the existing backend contract and
projected onto its public fields before entering query or mutation caches. Raw
responses are never attached to validation errors. Pure response handling lives
in the feature's private `utils/settingsResponse.js`; `settingsApi.js` contains
HTTP calls only. The public index exports hooks and `settingsQueryKeys`, without
exposing the private API adapter or response utilities.

Both reads forward query cancellation signals to the shared HTTP client. Hooks
inherit shared defaults: 30-second freshness, five-minute cache retention, no
automatic retries, and no refetch on window focus. Storage and image settings
have distinct keys under `['settings']`. Existing settings pages remain
placeholders; future page hooks consume this public feature interface.

Run `npm test --workspace @album-manager/web -- src/features/settings` to verify
requests, cache sharing and updates, cancellation, errors, response validation,
and exclusion of unexpected credentials from query and mutation results.
