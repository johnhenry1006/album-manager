# Development guide

This guide describes extension points in the current implementation. See the
[root README](../README.md) for installation, environment, services, workers and commands.
Read the following before changing application behavior:

- [Architecture rules](architecture/ARCHITECTURE_RULES.md)
- [Frontend structure](architecture/FRONTEND_STRUCTURE.md)
- [Backend structure](architecture/BACKEND_STRUCTURE.md)
- [Performance](architecture/PERFORMANCE.md)
- [Security](architecture/SECURITY.md)
- [Testing](architecture/TESTING.md)

Use JavaScript ES modules only: `.jsx` for React components and `.js` for hooks,
services and helpers. Reuse the existing module structure, dependencies and test runners.
Keep changes focused; split by responsibility rather than file length alone. Authentication lives in its own backend module/frontend feature; personal favorites receive
trusted actor context. Shared-library ownership changes require a separate design.

## Choose the owning layer

| Responsibility                                                                        | Owner                                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Route registration and application wiring                                             | Web `src/app`; API `src/app`                         |
| Page composition, URL state, navigation, drafts, confirmations, cross-feature actions | Web `src/pages/<domain>` and its page hooks          |
| Domain queries/mutations, cache policy and reusable domain UI                         | Web `src/features/<feature>`                         |
| Domain-independent hooks/presentation/pure utilities                                  | Web `src/hooks`, `src/components`, `src/utils`       |
| HTTP endpoint contracts and status translation                                        | Backend module routes/controllers/validators/mappers |
| Business rules and coordination                                                       | Backend module services                              |
| Persistence, SQL, transactions and locks                                              | Backend module repositories                          |
| Database/storage/queue/image vendor adapters and owned connections                    | API `src/infrastructure`                             |
| Queue boundary, worker/scheduler and process composition                              | API `src/jobs`                                       |
| Truly shared runtime-independent contracts/utilities                                  | `packages/shared/src`; currently a placeholder       |

Frontend `@/` resolves to `apps/web/src`. Backend aliases `#modules/*`,
`#infrastructure/*`, `#shared/*`, and `#config/*` resolve inside `apps/api/src`.
Use explicit filenames, including the target `index.js` for a public interface.

Pages consume public feature hooks/actions, which call private adapters through the
shared HTTP client. Features never import pages. Shared frontend modules never import
features/pages/app composition. Cross-feature/module imports use public indexes and
must stay acyclic. Backend shared/infrastructure code must not import business modules.
Test doubles do not authorize forbidden production dependencies.

## Add a new page

Use [DashboardPage](../apps/web/src/pages/dashboard/DashboardPage.jsx) for a small page
or [MediaLibraryPage](../apps/web/src/pages/media/MediaLibraryPage.jsx) for a gallery.

1. Choose an existing page domain or add `apps/web/src/pages/<domain>` for an actual
   new route. Create `<Name>Page.jsx`; keep its page-only components in `components/`
   and orchestration in `hooks/`.
2. Have the page call its page hook and render the returned data, state and actions.
   Use `PageContainer` plus the existing loading/empty/error/spinner components.
   Show empty state only after a successful empty query; retain useful results after
   background/cursor errors and expose a guarded retry action.
3. Put requests and domain cache logic in the owning feature, not JSX or page hooks.
   Use a feature component through its public index when appropriate.
4. Register the page in
   [AppRouter.jsx](../apps/web/src/app/router/AppRouter.jsx), normally under `AppLayout`.
   Add a sidebar entry to
   [navigation.js](../apps/web/src/app/router/navigation.js) only if it belongs in primary navigation.
5. Colocate `<Name>Page.test.jsx`. Mount real page/feature hooks with an isolated
   QueryClient and router, fake the network boundary, and exercise loading/errors,
   valid actions and consequential requests. Test confirmation cancellation for destructive actions.

Large media galleries must reuse `VirtualMediaGrid` and cursor feature hooks. Ordinary
bounded management pages can follow existing pagination contracts. Do not create a
parallel router/provider stack or automatically add a Zustand store for server state.

## Add a page hook

Examples: [useDashboardPage](../apps/web/src/pages/dashboard/hooks/useDashboardPage.js),
[useAlbumDetailPage](../apps/web/src/pages/albums/hooks/useAlbumDetailPage.js), and
[useUploadPage](../apps/web/src/pages/upload/hooks/useUploadPage.js).

1. Create `pages/<domain>/hooks/use<Name>Page.js` (or a focused page action/filter hook).
2. Import domain queries/mutations from `@/features/<feature>/index.js`. Import generic
   hooks such as `useDebounce`/`useIdSelection` directly from `@/hooks/...`.
3. Own the route's URL/filter state, navigation, drafts, confirmation lifecycle and
   coordination between features. Return a small view model with data/state/actions
   rather than exposing private API clients to the page.
4. Keep query keys, transport, request cancellation and domain invalidation in feature
   hooks. Page hooks may invoke public query/mutation actions; they must not import
   `feature/api/*`, the HTTP client or vendor transport.
5. Preserve drafts and failed selections after mutations fail; disable conflicting
   actions during pending writes. Bulk retries should target only unsuccessful IDs.
   Use shared `ConfirmDialog` presentation while keeping confirmation state here.
6. Test consequential orchestration using the real feature path with fake transport,
   or public feature-action doubles for a focused hook test. Cover captured options
   and completed-step checkpoints when coordinating multi-step actions.

The existing upload page hook is the model for cross-domain assignment: the upload
feature returns a final media ID; the page then invokes album/category/tag feature actions.
It never assigns the temporary processing ID or embeds relation ownership in the upload feature.

## Add a reusable feature hook

The [dashboard feature](../apps/web/src/features/dashboard) is the smallest complete
query example. [useInfiniteMedia](../apps/web/src/features/media/hooks/useInfiniteMedia.js)
and [useFavoriteMedia](../apps/web/src/features/media/hooks/useFavoriteMedia.js) show
cursor queries and mutation/cache behavior.

1. Use `features/<feature>/hooks/use<Name>.js` for reusable domain behavior, including
   TanStack Query logic even when its first consumer is a single page.
2. Add/reuse the private endpoint adapter in `features/<feature>/api/<feature>Api.js`.
   It calls `httpClient.request`, safely encodes path IDs and forwards the query's
   `AbortSignal`. Binary storage upload transport remains private to the upload feature.
3. Extend the feature's query-key factory. Include normalized filters/entity IDs in
   keys; do not share one key between incompatible response shapes.
4. Build the query/mutation hook. Guard missing IDs with `enabled`, keep cursors
   query-owned and opaque, and expose reusable loading/error/pagination state.
   Infinite gallery hooks use shared `flattenPaginatedItems` and the existing short
   inactive gallery cache retention. Do not debounce page navigation alongside search text.
5. For mutations, update/invalidate/remove the affected caches according to successful
   server behavior. Keep failed cached data intact unless a documented reconciliation
   rule requires refresh. Cross-feature key/action dependencies go through public indexes.
6. Export only deliberate consumer hooks/actions/components/keys through the feature
   `index.js`. Keep API adapters private; re-exporting clients must not become a shortcut
   around feature hooks.
7. Colocate tests using real React and TanStack Query with a fresh query client.
   Fake fetch/transport, assert cursor forwarding, cancellation, enabled state,
   observable errors and mutation cache effects; clear clients/stubs after tests.

Generic pure utilities go in `src/utils`; feature-specific rules stay with the domain.
Keep feature-to-feature imports minimal; changing cache behavior must not introduce a cycle.

## Add a generic hook

Examples: [useDebounce](../apps/web/src/hooks/useDebounce.js),
[useIdSelection](../apps/web/src/hooks/useIdSelection.js), and
[useMutationEditor](../apps/web/src/hooks/useMutationEditor.js).

1. Check that the hook works independently of media/albums/taxonomy, query contracts
   and route names. If it needs a business entity/API/cache policy, keep it in a feature.
   If it coordinates one page, keep it in that page's hooks.
2. Create `apps/web/src/hooks/use<Name>.js` using React/browser primitives and generic
   parameters/callbacks. It must not import features, pages or app composition.
3. Import it directly through `@/hooks/use<Name>.js`; no generic-hooks barrel is required.
   A pure computation without React/browser lifecycle usually belongs in `src/utils`.
4. Add focused colocated hook tests for its state transitions, cleanup and any pending/
   cancellation guards. Use controlled promises/fake timers instead of arbitrary sleeps.

`useIdSelection` owns IDs/Sets only; callers decide filter persistence and retry reconciliation.
The media feature's `useMediaSelection` is a compatibility alias, not the owner of generic
selection. `flattenMediaPages` similarly aliases `src/utils/flattenPaginatedItems.js`.
Never persist secrets or presigned capabilities via local-storage hooks.

## Add a backend module

Use [modules/albums/index.js](../apps/api/src/modules/albums/index.js) as a composition
example. Small modules need only concrete files for the implemented responsibility;
do not pre-create speculative business behavior.

```text
apps/api/src/modules/<feature>/
├── controllers/
├── services/
├── repositories/
├── validators/
├── mappers/
├── routes/
└── index.js
```

1. Define the endpoint/domain contract and the owning module. Add request schemas and
   focused validators for parameters, scalar queries, bodies, limits and allowed fields.
   Services must also enforce domain invariants before persistence/external side effects.
2. Implement service factories with injected repositories/providers/configuration.
   Keep Fastify request/reply objects and vendor clients out of domain services.
3. Implement repositories and explicit response mappers. Collections return bounded,
   lightweight projections; detailed metadata belongs in a detail contract. Use stable
   cursor ordering plus an ID tie-breaker and explicit null handling where relevant.
4. Make controllers translate validated HTTP input, call services and set response status.
   Let failures reach the shared error handler; use the existing domain error convention
   with safe status/code information, not a new endpoint error envelope.
5. Define a Fastify route plugin and export the intended factory/plugin/interface from
   `index.js`. Composition owns concrete dependencies. Add creation/injection in
   [app.js](../apps/api/src/app/app.js) and registration inside the existing `/api` scope
   in [registerPlugins.js](../apps/api/src/app/registerPlugins.js).
6. Follow the existing injectable-service pattern so HTTP tests can build a database-free
   app. Add service, validator/mapper, Fastify `inject` and necessary repository integration
   coverage. Do not instantiate connections when merely importing a module.
7. Document API contracts in `docs/api`, schema/migrations in `docs/database`, and any
   deliberate architecture exception before introducing it.

Business routes inherit one auth hook from application composition. Pass trusted
request.actor explicitly only to user-specific service/repository calls; never derive
identity from caller data. Frontend pages consume the auth public provider/hooks/guard.
Credentials stay in server configuration. Business modules import other modules only through
public `#modules/<feature>/index.js` interfaces; shared/infrastructure code stays below them.

## Add a repository

Examples: [album.repository.js](../apps/api/src/modules/albums/repositories/album.repository.js),
[mediaList.query.js](../apps/api/src/modules/media/repositories/mediaList.query.js), and
[mediaTrash.repository.js](../apps/api/src/modules/media/repositories/mediaTrash.repository.js).

1. Place `<name>.repository.js` in the owning module's `repositories/`. Accept the
   already-owned Prisma client or transaction client; only
   [database/client.js](../apps/api/src/infrastructure/database/client.js) constructs Prisma.
2. Expose domain-oriented operations used by the service. Keep Prisma/SQL decisions,
   explicit projections, soft-delete filters, referential checks and locking here.
   Compose query/projection helpers in this directory when reused.
3. Use parameterized/tagged SQL for raw queries. Never interpolate externally supplied
   SQL, unchecked identifiers or values. Return projected records for domain/mapping layers.
4. For cursor collections fetch `limit + 1`, compare all ordering fields with the same
   direction as `orderBy`, and use a stable ID tie-breaker. Avoid per-item detail lookups.
   Retain existing offset contracts where they are deliberate; a cursor migration also
   requires API/client work, not just a new query.
5. Reuse transaction-scoped clients throughout an operation. Follow the appropriate
   existing locking/isolation pattern; do not assume nested `$transaction` means a client
   owns a connection. Album/taxonomy factories demonstrate scoped repositories/savepoints.
   Keep storage IO out of transactions when safe, without weakening immutable-original,
   purge or retry guarantees that currently rely on locks.
6. Add unit query-contract tests with an injected client, and real PostgreSQL tests for
   constraints, rollback, race/locking or pagination guarantees. Reuse
   [isolatedDatabase.testUtils.js](../apps/api/src/infrastructure/database/isolatedDatabase.testUtils.js)
   for random schemas/all-migration setup and fixture rollback.
7. When schema changes, create a new reviewed migration, generate Prisma explicitly,
   and preserve SQL-managed checks/partial indexes. Do not rewrite applied migrations.

A fake Prisma call-shape test does not prove database semantics. The root README describes
how to enable the complete `DATABASE_TESTS=1` API suite rather than the schema-only shortcut.

## Add a queue job

Examples: [mediaProcessing.job.js](../apps/api/src/jobs/mediaProcessing.job.js),
[mediaProcessing.worker.js](../apps/api/src/jobs/mediaProcessing.worker.js), and
[mediaCleanup.schedule.js](../apps/api/src/jobs/mediaCleanup.schedule.js).

1. Put business processing in the owning module's service, callable independently of HTTP.
   Define a strict payload validator at the job/domain boundary; payloads should contain
   server identifiers and explicit policy, not file bytes, credentials or arbitrary storage keys.
2. For a new queue, extend `QUEUE_NAMES` in
   [queue.js](../apps/api/src/infrastructure/queue/queue.js). Add a deliberately named
   producer operation and input validation; the current factory rejects unknown queues
   and `enqueueMediaProcessing` is specific to the media-processing queue.
3. Use a stable job identity and an idempotent service. Current media jobs use `mediaId`,
   with a separate `-allow-duplicate` identity for explicit duplicate admission. Delivery
   and retries can overlap; preserve committed checkpoints and immutable originals.
4. Add `jobs/<name>.job.js` to compose public module factories with injected repositories/
   storage/processor. Add a worker wrapper around `createJobWorker` that validates the
   expected `job.name` and delegates `job.data` to the validated service.
5. Throw failures so BullMQ can retry; do not swallow them or mark partial work successful.
   Transport logging must remain sanitized and omit payloads, vendor messages and secrets.
   Defaults are three attempts, exponential 1-second initial backoff, up to 1000 completed
   jobs retained and failed jobs retained for inspection.
6. Add explicit process composition in `jobs/<name>.server.js` and a workspace script in
   `apps/api/package.json`. Reuse `startMediaWorker`/`createJobRuntime` when their database/
   storage ownership fits. Importing the entry point must not connect, consume jobs or
   register a schedule; follow the existing direct-execution guard.
7. For periodic work, register the scheduler separately and use a stable shared identity.
   Cleanup uses `upsertJobScheduler('trash-retention-cleanup', ...)` hourly in UTC.
   Policy comes from validated server config, not untrusted scheduler payloads.
8. Test payload/job-name validation, acceptance failure, idempotency, retries, shutdown
   and partially initialized resource cleanup. Add opt-in real Redis coverage with a
   unique namespace. Document the command/env/service prerequisites.

Producer Redis commands have bounded retries and no offline queue; workers need persistent
blocking connections (`maxRetriesPerRequest: null`). Do not collapse these roles. An HTTP
upload may await durable persistence and job acceptance, but must never await transformation.
Compose runs infrastructure; a new worker is not automatically deployed.

## Add a media variant

Read [image processing](architecture/IMAGE_PROCESSING.md) and inspect
[mediaVariant.service.js](../apps/api/src/modules/media/services/mediaVariant.service.js)
and [mediaRenditions.service.js](../apps/api/src/modules/media/services/mediaRenditions.service.js).

1. Decide whether an additional rendition fits an existing type. Another thumbnail size
   normally uses `THUMBNAIL` with a distinct `name`, not a new enum. Identity is
   `(mediaId, type, format, name)`; `storageKey` is globally unique. Names use lowercase
   alphanumeric/hyphen syntax, start with an alphanumeric character, and have at most 64 characters.
2. For a new semantic type, update `MediaVariantType` in the Prisma schema and add a
   migration; update allowed types in `modules/media/validators/media.validator.js`.
   Supply validated size and a safe storage key, plus applicable quality. Dimensions are
   optional; when supplied, provide width and height together.
3. Extend [buildVariantSpecifications](../apps/api/src/infrastructure/image-processing/imageProcessing.utils.js)
   and the processor if generation changes. Settings changes also need backend defaults,
   validation/persistence, API and frontend form work. Current derivatives are WebP;
   output-format changes require a deliberate contract change, not just a file extension.
4. Update `VARIANT_DIRECTORIES` in `infrastructure/storage/storage.constants.js` if needed.
   A new directory must also be accepted by `validateMediaStorageKey` in
   `storageValidation.js`, so permanent deletion can validate its complete recorded manifest.
   Never add prefix deletion or bypass key confinement.
5. Persist through rendition/variant services using separate derivative keys. Preserve
   live-parent locking, identity conflict recovery, object-before-row retry recovery and
   original immutability. No generated derivative may use type `ORIGINAL` or its storage key.
6. If the variant is displayable, update explicit backend detail selection/signing allowlists,
   projections/mappers and frontend selection in `useMediaVariants`/`ResponsiveImage`.
   Keep grid cards and gallery queries thumbnail-only; do not send original URLs or bulky
   detail metadata in list payloads. New preview behavior belongs in the detail viewer.
7. Review storage and dashboard aggregate semantics. Storage usage includes trash and
   all non-original variants; optimized savings explicitly use `OPTIMIZED`. Dashboard totals
   exclude trash. New types must not double-count bytes or silently change those contracts.
8. Test real Sharp output dimensions/format/orientation when processing changes; test
   failed processing must not publish READY, original byte/key immutability, retry identity,
   purge manifest acceptance and the updated HTTP/display projections.

Settings affect later processing; saving them does not automatically regenerate existing
media. A reprocessing/backfill facility would need its own job, lifecycle and recovery design.

## Add a new storage provider

A different S3-compatible service usually needs only endpoint/region/bucket/path-style
configuration. A new provider implementation is for a different contract backend, not
another hard-coded S3 Ninja path. Read [storage architecture](architecture/STORAGE.md).

1. Implement the contract in `apps/api/src/infrastructure/storage/<provider>/`, following
   [StorageProvider](../apps/api/src/infrastructure/storage/storageProvider.js) and the
   [S3 adapter](../apps/api/src/infrastructure/storage/s3/s3StorageProvider.js).
2. Preserve the current object-shaped operations:

    | Operation                                                                  | Contract                                                                                   |
    | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
    | `getProviderMetadata()`                                                    | Safe synchronous `{ providerType, endpointHost, bucketName }`; no credentials/internal URL |
    | `read({ key })`                                                            | Object bytes as a Buffer                                                                   |
    | `upload({ key, body, contentType, contentLength, metadata })`              | `{ key, etag }`; stream bodies require known length                                        |
    | `delete({ key })`                                                          | Idempotent if the object is already missing                                                |
    | `exists({ key })`                                                          | Boolean; permission/transport failures must propagate                                      |
    | `getObjectMetadata({ key })`                                               | Object metadata or null for genuinely missing objects only                                 |
    | `createPresignedUploadUrl({ key, contentType, contentLength, expiresIn })` | Browser PUT URL, method, required headers and finite expiry                                |
    | `createPresignedDownloadUrl({ key, expiresIn, method, download })`         | GET/HEAD URL; explicit original download uses attachment GET                               |
    | `copyObject({ sourceKey, destinationKey, sourceEtag })`                    | `{ key, etag }`; distinct destination and source-version condition                         |
    | `close()`                                                                  | Idempotent release of owned clients; reject subsequent operations                          |

3. Reuse storage key/content-type/expiry validation and map vendor exceptions to safe
   `StorageError(operation)`. Distinguish not-found from access-denied/unavailable errors.
   Preserve exact size/type signing, conditional copy and immutable originals. A backend
   without browser signing/version checks needs a deliberate API/transport redesign;
   it is not a drop-in provider for the current upload workflow.
4. Extend driver validation in `src/config/storage.js`, factory dispatch in
   `storageFactory.js` and deliberate exports. Add only server-owned config/env examples.
   Create the concrete provider in API/worker composition and inject it into services;
   domain modules must not import vendor adapters or construct providers.
5. Supply browser-reachable signed URLs from the start, keep operation/signing endpoints
   distinct where needed, and configure provider CORS for direct PUT/GET/HEAD. Do not
   rewrite signed hosts/paths or persist/log signed capabilities.
6. Test SDK translation, validation, missing-object semantics, failures, conditional copy,
   safe metadata and cleanup using injected clients. Add isolated real-provider tests
   for wire compatibility and signing enforcement. Update environment/setup/troubleshooting
   docs and all affected contracts before declaring compatibility.

Do not put provider SDKs/credentials in the browser or `packages/shared`, enumerate/delete
arbitrary prefixes from client input, or couple business code to emulator administration.

## Verify and document the change

Run appropriate colocated tests during development, then repository checks from the root:

```sh
npm test
npm run lint
npm run format:check
npm run build --workspace @album-manager/web
```

The [testing guide](architecture/TESTING.md) defines what each layer proves and what
requires PostgreSQL/Redis/storage integrations. Report skipped external suites separately.
For documentation-only edits, verify formatting, relative links, commands against manifests
and referenced source contracts; do not claim external services were exercised.

`infrastructure/scripts/architecture.test.js` checks the application import graph,
public indexes and common direct-transport boundaries. It resolves relative/alias imports
and literal dynamic imports, but does not replace manual review of computed dependencies,
business responsibilities or every possible network alias.

Keep README startup instructions current when commands/config change. Update endpoint
contracts under `docs/api`, database decisions under `docs/database`, and architecture
behavior/debt under `docs/architecture`. Historical plans are context, not the authority
for current runtime capabilities or environment settings.
