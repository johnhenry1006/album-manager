# Frontend structure

The frontend workspace is `apps/web`. Its source tree is:

```text
src/
├── app/
│   ├── App.jsx
│   ├── main.jsx
│   ├── router/
│   ├── providers/
│   └── layouts/
├── pages/
├── features/
├── components/
│   ├── ui/
│   ├── common/
│   ├── media/
│   └── layout/
├── hooks/
├── services/
├── store/
├── utils/
├── constants/
├── config/
├── styles/
└── test/
```

React and Vite initialize a JavaScript-only application shell. `app/main.jsx`
mounts `AppProviders` and React Router's `BrowserRouter`; `app/App.jsx` renders
the base router. `QueryProvider` owns one stable TanStack Query client per mount.
`AppLayout` composes the shared sidebar/header with a route outlet, and navigation
metadata stays in `app/router` rather than shared components. Styling uses CSS
modules with global foundations in `styles/global.css`.

Routes cover dashboard, albums/details, media/details, upload, categories, tags,
favorites, search, trash, settings, storage, and image optimization. `/` redirects
to `/dashboard`; unmatched URLs show a not-found page. `/media` renders the media
library, and `/media/:mediaId` renders media details. `/albums` composes a thin
`AlbumListPage` with page hooks consuming public album feature hooks. Album list
URL controls are `q`, `visibility`, `sort`, `page`, `limit`, and `view`. Search is
debounced by 300 ms; visibility and sorting run on the server before pagination.
Pages hold at most 48 albums, with grid/list modes sharing card components and
thumbnail-only feature covers. An inline creation form uses the feature mutation
and returns to the unfiltered newest-first list after success. Other pages remain minimal
placeholders. The library page composes a
page hook consuming public media/category/tag hooks, with cursor pagination and
TanStack Virtual rendering thumbnail cards. Its URL filters are `q`, `type`,
`category`, `tag`, `favorite`, `takenAtFrom`, and `takenAtTo`. Search requests are
debounced by 300 ms; capture date bounds use inclusive UTC days. Category and tag
option lists have their own pagination. Card activation navigates to media details;
no selection state is introduced. The detail page composes `useMedia` and
`useMediaVariants` through a page hook. Its viewer uses preview/optimized variants;
original URLs are signed only through an explicitly invoked feature mutation.
Page action hooks coordinate favorite/trash feedback and return to the library
after trash succeeds. Metadata and album/category/tag memberships render in a
separate panel. Zustand is installed but no store exists until
truly global client state is needed; server state belongs in TanStack Query.

Run `npm run dev --workspace @album-manager/web`,
`npm run build --workspace @album-manager/web`, or
`npm test --workspace @album-manager/web` from the repository root. Vitest uses
jsdom and React Testing Library with shared setup in `src/test/setup.js`.
See [Code quality foundations](CODE_QUALITY.md) for `@/` aliases and quality
commands. The boundaries below apply to all future application code.

## Responsibilities

| Location            | Responsibility                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `app/router`        | Route registration and route composition                                    |
| `app/providers`     | Application-wide provider composition                                       |
| `app/layouts`       | Route shells and layout composition                                         |
| `pages`             | Thin route-facing React components and page-specific orchestration          |
| `features`          | Business-domain UI, services/domain logic, hooks, actions, and API modules  |
| `components/ui`     | Domain-independent visual primitives                                        |
| `components/common` | Reusable components with no feature or page dependencies                    |
| `components/media`  | Reusable media presentation primitives, independent of feature data access  |
| `components/layout` | Reusable layout primitives used by application shells                       |
| `hooks`             | Completely domain-independent reusable hooks                                |
| `services`          | Generic HTTP transport, API errors, and TanStack Query client configuration |
| `store`             | Generic client state infrastructure; domain state belongs to its feature    |
| `utils`             | Domain-independent pure helpers                                             |
| `constants`         | Shared frontend constants without feature dependencies                      |
| `config`            | Validated public frontend configuration                                     |
| `styles`            | Global styling foundations                                                  |
| `test`              | Shared test setup, fixtures, and helpers                                    |

Feature-specific components and helpers stay inside their feature. Promote them
to shared layers only when their responsibility is genuinely shared and they
can remain independent of features/pages. `packages/shared` is for cross-application
contracts and pure helpers, not a replacement for frontend shared folders.

## Frontend infrastructure

`config/api.js` validates `VITE_API_BASE_URL` at startup. Set this public value in
`apps/web/.env.local` (see `apps/web/.env.example`), then restart Vite or rebuild.
The default is `/api` on the browser's current origin; same-origin hosting must
forward that prefix to the backend. An absolute HTTP(S) URL must include the API
prefix (for example `http://localhost:3000/api`) and requires the backend to permit
the frontend origin through CORS. Credentials, query strings, and fragments are
rejected in the base URL. Never put server secrets in `VITE_*` configuration.

Feature API modules call `httpClient.request(path, { method, body, headers, signal })`.
Paths are relative to the API prefix, with an optional leading slash; external
URLs are rejected. The default method is GET. `body` is a JSON value, serialized
with a JSON content type. Successful JSON responses are parsed; empty, HEAD,
204, and 205 responses return `null`. Malformed JSON or non-JSON success bodies
throw `ApiError` with `code: 'INVALID_RESPONSE'`. Binary responses and direct
presigned storage uploads require their own future transport, not this JSON client.

`services/apiError.js` exports `ApiError` and `normalizeApiError`. Errors expose
`message`, `status` (actual HTTP status, or `0` without a response), `code`,
`requestId` (or `null`), and an optional diagnostic `cause`. HTTP errors consume
the backend's `{ error, message, requestId }` envelope, validating field types.
Unusable error bodies fall back to `HTTP_ERROR` with a generic status message;
network failures use `NETWORK_ERROR`. Raw HTML or network exception messages are
never used as display messages. Cancellation retains the AbortSignal's reason or
original AbortError and is not normalized as an API failure.

`services/queryClient.js` exports `createQueryClient`; `QueryProvider` uses it once
per mount. Queries use a **30-second stale time** and retain inactive cache entries
for **5 minutes**. Queries and mutations have **no automatic retries**, and window
focus does not trigger refetches. Stale queries retain TanStack Query's default
refetch-on-mount and refetch-on-reconnect behavior. Feature hooks may override
these defaults deliberately; the HTTP client itself never retries.

Reusable feature hooks own query keys and queries/mutations. Pass the query
function's AbortSignal through the feature API module to the HTTP transport:

```js
// Inside a feature hook; its API module owns the actual HTTP call.
queryFn: ({ signal }) => mediaApi.list({ signal });

// Inside that feature's private API module:
httpClient.request('media', { signal });
```

Pages and page hooks continue to consume the feature's public `index.js`, never
the generic HTTP client or private feature API modules. Tests cover transport
responses, normalized failures, cancellation, public configuration, cache
freshness, retry behavior, and provider cache isolation.

## Hook placement

| Usage                             | Required location           |
| --------------------------------- | --------------------------- |
| Used by one page only             | `pages/<domain>/hooks/`     |
| Reusable within a business domain | `features/<feature>/hooks/` |
| Completely domain-independent     | `src/hooks/`                |

Page hooks compose feature hooks/actions and coordinate page state, filters,
selection, and navigation. They consume the feature public `index.js` and must
not import feature API implementations directly.

Feature hooks own reusable domain behavior and TanStack Query queries/mutations,
including query keys and cache updates. Feature API modules own domain requests
and consume the generic HTTP client in `src/services`. Business decisions belong
in feature services/domain modules and pure functions where possible. Generic
hooks must never become a home for domain-specific orchestration.

## Dependency direction

```text
pages
  ↓
features
  ↓
shared components/hooks/services/utils
```

Features must not depend on pages. Shared/common frontend modules must not
import from features or pages. Application composition in `src/app` wires
routes and providers; lower layers must not depend on that composition.

The typical request flow is:

```text
page component → page hook → feature index.js → feature hook/action
                                                ↓
                                          feature API module
                                                ↓
                                     shared services/httpClient
```

The public index exposes intentional hooks/actions/components and hides API
internals. It must not re-export an API client to let pages bypass feature hooks.

## Mandatory import boundaries

Allowed:

- Page component → page hook.
- Page hook → feature public `index.js`.
- Feature → shared hooks/components/services/utils.
- Feature A → feature B public `index.js` only when genuinely required.

Forbidden:

- Page/page hook → `feature/api/*`.
- Page/component → `httpClient` directly.
- Shared/common → `features/*`.
- Feature → `pages/*`.
- Deep cross-feature imports that bypass `index.js`.

Within a feature, internal modules may import one another by relative path.
Cross-feature dependencies must be minimal and acyclic, and use the target
public index. Any exceptional cross-feature boundary requires explicit rationale
in an architecture document before use; an exception must not weaken the page,
API-client, or shared/common prohibitions.

## Media and testing rules

Large collections use pagination and large gallery views use virtualization.
Grid/list components consume thumbnails or previews, never original image files.
Feature hooks should expose compact paginated results and loading/error states
that page hooks can compose without duplicating network or cache logic.

Future feature tests belong with the behavior they exercise; `src/test` holds
shared test support. Test domain functions, feature hooks, page orchestration,
and important UI behavior as appropriate. Use the file size guidance in
[Architecture rules](ARCHITECTURE_RULES.md), splitting by responsibility.
