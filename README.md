# Album Manager

A JavaScript application for managing a private media library with local accounts. It includes
albums and memberships, categories/tags, favorites, metadata search, direct uploads,
background image processing, trash/restore/permanent deletion, dashboard summaries,
and image-optimization/storage settings.

The media library, search, favorites, trash and album galleries share a virtualized
thumbnail grid. Media details display derived previews and offer an explicit original
download action. `/settings` is currently a placeholder; its storage and image-optimization
subpages are implemented. Video metadata can be registered, but the worker currently
processes images only. Unsupported/animated images and videos fail processing explicitly.

Email/password login and HttpOnly cookie sessions protect the API and application shell.
Favorites belong to each user. Authenticated accounts share and can modify the library;
album visibility remains metadata. See [authentication setup](docs/api/AUTH.md) for
migrations and local account provisioning before first sign-in.
See [security boundaries](docs/architecture/SECURITY.md) before deployment.

## Architecture overview

Three private npm workspaces separate browser code, backend code and runtime-independent
shared code. All project code uses JavaScript ES modules (`.js`/`.jsx`), with no TypeScript
compiler or configuration.

```text
Browser: page → page hook → feature index.js → feature hook/action → private API adapter → HTTP client
Backend: route → controller → service → repository / injected infrastructure provider
Worker:  validated queue job → service → repository / storage provider / image processor
```

TanStack Query owns server state. Pages and controllers stay thin; services own domain
rules, repositories own database operations, and infrastructure owns vendor adapters
and connection lifecycles. Originals are immutable, derivatives have separate storage
keys, and upload HTTP requests await queue acceptance rather than image transformations.

Start with [architecture rules](docs/architecture/ARCHITECTURE_RULES.md),
[frontend structure](docs/architecture/FRONTEND_STRUCTURE.md),
[backend structure](docs/architecture/BACKEND_STRUCTURE.md), and
[the development guide](docs/DEVELOPMENT.md).

Optional AI search has a separate provider-neutral module and indexing worker for image
embeddings, text-to-image search, generated tags, and similarity search. It is disabled
until a server-only provider adapter is configured. See [semantic search](docs/architecture/SEMANTIC_SEARCH.md)
for setup, API contracts, and vector-index limits. Existing metadata search remains available.

## Tech stack

| Area                 | Implementation                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- |
| Language/tooling     | JavaScript ES modules, npm workspaces, ESLint, Prettier                                |
| Frontend             | React 19, React Router 7, Vite 8, CSS modules                                          |
| Data/rendering       | TanStack Query 5, TanStack Virtual 3; Zustand is installed but no store is implemented |
| HTTP API             | Fastify 5, JSON-schema request validation, centralized errors                          |
| Persistence          | PostgreSQL 17, Prisma 7 with the PostgreSQL driver adapter                             |
| Jobs                 | Redis 7, BullMQ 6, ioredis                                                             |
| Media                | Sharp, SHA-256 duplicate detection, WebP derivatives                                   |
| Storage              | Injected S3-compatible provider using AWS SDK v3; local S3 Ninja 8.7.3                 |
| Tests                | Vitest, React Testing Library/jsdom, Node's built-in runner for tooling                |
| Local infrastructure | Docker Compose v2; Nginx 1.28 sidecar for storage CORS                                 |

The manifests and root `package-lock.json` are the dependency/version source of truth.

## Prerequisites

- Node.js **22.14 or later** and npm **10 or later**.
- Docker Engine/Desktop with Docker Compose **v2**, available to your user.
- Free local ports `3000`, `5173`, `5434`, `6380`, and `9445`, or matching custom configuration.

Run commands from the repository root unless stated otherwise:

```sh
npm ci
npm run check
```

Docker runs infrastructure only. The frontend, API and workers run as separate host
processes; there are no application containers in the current Compose file.

## Environment variables

Generate the ignored root `.env` before starting infrastructure:

```sh
node infrastructure/scripts/setup-local-env.js
```

The script generates PostgreSQL/Redis passwords and S3 credentials, writes with owner-only
permissions, and refuses to overwrite an existing `.env` (exit code 1). If the file already
exists, edit it locally. Alternatively, copy `.env.example` and fill its four blank
credential values yourself. Do not commit secrets or publish expanded Compose configuration.

Compose, the API, Prisma CLI and worker entry points use the root `.env`. API/CLI environment
loading preserves existing process variables. Frontend public configuration belongs in
`apps/web/.env.local` or the environment passed to Vite; Vite does not read the root `.env`
as the web workspace's env file. Never put database, Redis or storage credentials in `VITE_*`.

### Application and local infrastructure

| Variable                         | Default / local example          | Meaning                                                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`           | `album-manager`                  | Container/network/volume prefix                                                                                   |
| `NODE_ENV`                       | `development`                    | API mode: development, test or production                                                                         |
| `API_HOST`, `API_PORT`           | `127.0.0.1`, `3000`              | API bind address/port                                                                                             |
| `LOG_LEVEL`                      | `info`                           | Fastify logging level                                                                                             |
| `API_SHUTDOWN_TIMEOUT_MS`        | `10000`                          | Shutdown deadline; 1–120000 ms                                                                                    |
| `FRONTEND_ORIGIN`                | Example: `http://localhost:5173` | One exact API/storage browser origin, with no trailing slash; unset API config permits no Origin-bearing requests |
| `API_RATE_LIMIT_MAX`             | `600`                            | Requests per socket IP/window/API instance; 1–100000                                                              |
| `API_WRITE_RATE_LIMIT_MAX`       | `120`                            | Mutation quota within that window; 1–100000                                                                       |
| `API_RATE_LIMIT_WINDOW_MS`       | `60000`                          | Fixed window; 1–3600000 ms                                                                                        |
| `DATABASE_URL`                   | Optional PostgreSQL URL          | Overrides `POSTGRES_*` for API/Prisma, not Compose initialization                                                 |
| `POSTGRES_HOST`, `POSTGRES_PORT` | `localhost`, `5434`              | Host-run API/CLI database address                                                                                 |
| `POSTGRES_DB`, `POSTGRES_USER`   | `album_manager`, `album_manager` | Database and role initialized by Compose                                                                          |
| `POSTGRES_PASSWORD`              | Required/generated               | Compose/database password                                                                                         |
| `REDIS_HOST`, `REDIS_PORT`       | `localhost`, `6380`              | Host-run queue connection                                                                                         |
| `REDIS_PASSWORD`                 | Generated; Compose requires it   | Queue connection password; backend validator permits omission for other Redis deployments                         |
| `REDIS_DB`, `REDIS_TLS`          | `0`, `false`                     | Database index 0–15; TLS uses literal true/false                                                                  |
| `REDIS_CONNECT_TIMEOUT_MS`       | `10000`                          | Queue connection/command/startup timeout; 1–120000 ms                                                             |
| `QUEUE_PREFIX`                   | `album-manager`                  | Shared queue namespace; API and workers must match                                                                |
| `QUEUE_WORKER_CONCURRENCY`       | `1`                              | Concurrent jobs per worker; 1–32                                                                                  |
| `TRASH_RETENTION_DAYS`           | `30`                             | Cleanup cutoff; 1–36500 days                                                                                      |

### Storage

The values marked as examples must be supplied; they are provided by `.env.example`,
not implicit endpoint/credential defaults in the storage validator.

| Variable                         | Default / local example                                       | Meaning                                                      |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| `STORAGE_DRIVER`                 | `s3`                                                          | The only currently implemented driver                        |
| `S3_PORT`                        | `9445`                                                        | Published development proxy port                             |
| `S3_ENDPOINT`                    | Example: `http://localhost:9445`                              | Backend object operations endpoint                           |
| `S3_PUBLIC_ENDPOINT`             | Example: `http://localhost:9445`; falls back to `S3_ENDPOINT` | Browser URL signing endpoint                                 |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Required/generated                                            | Server-only provider credentials                             |
| `S3_REGION`, `S3_BUCKET`         | Examples: `us-east-1`, `album-manager`                        | Required signing region/bucket                               |
| `S3_FORCE_PATH_STYLE`            | `true`                                                        | S3 path-style addressing; literal true/false                 |
| `S3_JAVA_XMX`                    | `512m`                                                        | Local emulator JVM heap; not an application-provider setting |

### Uploads and media URLs

| Variable                            | Default               | Bounds / behavior                                                                        |
| ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `UPLOAD_MAX_FILE_SIZE_BYTES`        | `104857600` (100 MiB) | 1 byte–5 GiB; processing currently buffers originals                                     |
| `UPLOAD_MAX_FILES_PER_SESSION`      | `1000`                | 1–100000                                                                                 |
| `UPLOAD_URL_EXPIRY_SECONDS`         | `900`                 | 1–3600 seconds                                                                           |
| `UPLOAD_SUPPORTED_MIME_TYPES`       | See `.env.example`    | Comma-separated subset of the formats in `apps/api/src/shared/constants/mediaFormats.js` |
| `MEDIA_LIST_MAX_LIMIT`              | `200`                 | 1–1000; album-media caps its effective maximum at 200                                    |
| `MEDIA_LIST_URL_EXPIRY_SECONDS`     | `900`                 | Thumbnail signing; 1–3600 seconds                                                        |
| `MEDIA_DETAIL_URL_EXPIRY_SECONDS`   | `900`                 | Display variants; 1–3600 seconds                                                         |
| `MEDIA_ORIGINAL_URL_EXPIRY_SECONDS` | `900`                 | Explicit original downloads; 1–3600 seconds                                              |
| `VITE_API_BASE_URL`                 | `/api`                | Public frontend API base; include `/api` when using an absolute URL                      |

`PUBLIC_API_BASE_URL` appears in the root example but is not consumed by application
code. Set **`VITE_API_BASE_URL`** for the frontend. Image-optimization settings are
persisted through the settings API rather than configured by environment variables.
The browser has its own advisory upload-policy defaults (including 100 MiB per file);
changing backend upload environment limits does not automatically change that policy.
Job attempts/backoff are currently fixed in source (three attempts, exponential backoff
starting at one second); there are no `QUEUE_JOB_ATTEMPTS`/`QUEUE_BACKOFF_DELAY_MS` env options.

## Local infrastructure startup

After configuring `.env`:

```sh
docker compose config --quiet
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

| Service                | Host address               | Compose network address  |
| ---------------------- | -------------------------- | ------------------------ |
| PostgreSQL             | `localhost:5434`           | `postgres:5432`          |
| Redis                  | `localhost:6380`           | `redis:6379`             |
| S3-compatible endpoint | `http://localhost:9445`    | `http://s3ninja:9000`    |
| S3 Ninja UI            | `http://localhost:9445/ui` | `http://s3ninja:9000/ui` |

Published ports bind to `127.0.0.1`. `s3-public` is the Nginx proxy and owns the published
S3 port; the emulator itself is not published. Named volumes persist PostgreSQL data,
Redis AOF data, and S3 objects/multipart/logs on the dedicated Compose bridge network.
Changing published ports also requires updating the corresponding host-run endpoint values.

```sh
docker compose logs -f
docker compose stop
docker compose up -d --wait
docker compose down
```

`down` preserves named volumes. `docker compose down --volumes` is an intentional,
destructive local reset that deletes the database, queued jobs and stored media.

## S3 Ninja setup

1. Open `http://localhost:9445/ui` after Compose is healthy.
2. Create the bucket named by `S3_BUCKET` (default `album-manager`) using **New Bucket**.
3. Keep it private. Bucket auto-creation is disabled; creation is a one-time step per data volume.

Use `STORAGE_DRIVER=s3` for both S3 Ninja and other compatible S3 deployments. Application
code uses the provider contract, never Ninja-specific UI routes. Backend operations use
`S3_ENDPOINT`; URLs returned to the browser are signed using `S3_PUBLIC_ENDPOINT`.
A containerized backend would need internal hostnames, while the browser still needs a
publicly reachable endpoint. Do not rewrite a URL's host, port or path after signing.

Native emulator CORS is disabled. The Nginx sidecar allows the exact `FRONTEND_ORIGIN`
for `PUT`, `GET`, `HEAD`, and preflight requests, exposes ETag and related response headers,
and forwards the original Host/path. After changing the origin, recreate the proxy:

```sh
docker compose up -d --force-recreate s3-public
curl -i -X OPTIONS http://localhost:9445/album-manager/check.txt \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect status 204 and `Access-Control-Allow-Origin: http://localhost:5173`.
Use the actual origin/port if changed. API CORS and object-storage CORS are separate;
production storage needs its own provider policy. See [storage architecture](docs/architecture/STORAGE.md).

## PostgreSQL setup

Compose initializes the configured database/role when its data volume is first created.
Verify availability or open a SQL session without putting credentials in command arguments:

```sh
docker compose exec postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The host-run backend uses port 5434. `DATABASE_URL`, when set, takes precedence over
`POSTGRES_*`; percent-encode credentials in a manually supplied URL. Changing `.env`
does not rotate an existing PostgreSQL role's password. Rotate it in PostgreSQL first,
then update configuration. Apply migrations before starting the API/workers.
See [database rules](docs/database/DATABASE_RULES.md) and [schema](docs/database/SCHEMA.md).

## Redis setup

Compose enables password authentication, AOF persistence and `maxmemory-policy noeviction`
for BullMQ. The container supplies `REDISCLI_AUTH`, so the following check needs no
password argument:

```sh
docker compose exec redis redis-cli ping
```

Expect `PONG`. API and workers must use the same host/port, password, database and
`QUEUE_PREFIX`. Producers have bounded connection retries; workers use BullMQ's
persistent blocking connections. Redis does not start application workers automatically.

## Frontend startup

**Vite has no configured `/api` proxy.** For the current separate host-run API,
start the frontend with an explicit public API URL:

```sh
VITE_API_BASE_URL=http://localhost:3000/api npm run dev --workspace @album-manager/web -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. `--strictPort` avoids silently switching to an origin
that no longer matches `FRONTEND_ORIGIN`. This inline environment syntax is for POSIX
shells. For a persistent/cross-platform setting, create `apps/web/.env.local` containing:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

Then run `npm run dev --workspace @album-manager/web -- --host localhost --port 5173 --strictPort`.
Restart Vite after changing env files. Using `/api` is appropriate only when your host/proxy
forwards it to the backend. `localhost` and `127.0.0.1` are different browser origins.

```sh
npm run build --workspace @album-manager/web
npm run preview --workspace @album-manager/web
```

Builds read the same public config; set the deployed API URL at build time. Vite preview
normally uses port 4173, so API/storage origins must match if exercising uploads there.
Production hosting must serve `apps/web/dist/index.html` for SPA routes and configure
API forwarding or CORS as appropriate. Preview is a local build inspection server.

## Backend startup

With infrastructure available, the bucket created, and migrations/client generated:

```sh
npm run dev --workspace @album-manager/api
# Without file watching:
npm start --workspace @album-manager/api
curl http://127.0.0.1:3000/api/health
```

The server validates configuration and connects PostgreSQL and the queue producer before
listening. Storage configuration is validated, but startup does not create/check the bucket.
`/api/health` reports process liveness (`status`, timestamp, package version), not ongoing
readiness of every external service. HTTP errors use centralized, sanitized envelopes.
SIGINT/SIGTERM close owned resources with a configured shutdown deadline.

API contracts live in [docs/api](docs/api): health, uploads, media/detail/favorites,
albums, taxonomy, trash, dashboard and settings. The API does not spawn workers or
apply database migrations at startup.

## Prisma migrations

Prisma uses `apps/api/prisma.config.js`, the committed schema and migration history.
For a fresh local database, apply existing migrations and explicitly generate the client:

```sh
npm run db:deploy
npm run db:generate
```

For a deliberate schema change on a development database:

```sh
npm run db:migrate -- --name describe_the_change
npm run db:generate
```

Review generated SQL and commit schema and migration together. Never edit an applied
migration or use `migrate dev`/`db push` as a production deployment workflow.
`db:generate` can run without a live database when credentials are absent; database
operations require configured access. Generation/seeding are separate commands.

```sh
npm run db:studio
```

Studio is a local inspection tool; do not expose it publicly.

## Seed commands

```sh
npm run db:seed
# Equivalent workspace command:
npm run db:seed --workspace @album-manager/api
```

The current seed opens the database, checks health and closes it. It **does not insert
albums, media, users or settings**. A successful seed is a connectivity check, not demo
content. If seed data is added later, use repository factories and idempotent operations.

## Worker startup

Run each worker in a separate terminal/process using the same root `.env` as the API:

```sh
npm run worker:media --workspace @album-manager/api
npm run worker:cleanup --workspace @album-manager/api
```

- **Media worker:** consumes `process-media` jobs on `media-processing`; validates
  payloads, detects duplicates, processes images and persists derivatives. Default
  concurrency is one. Increase file-size/concurrency limits only after memory measurement.
- **Cleanup worker:** consumes `cleanup-media` on `media-cleanup` and registers the
  stable `trash-retention-cleanup` scheduler, hourly at minute zero in UTC. It purges
  media older than `TRASH_RETENTION_DAYS` using storage-first, retryable deletion.

Jobs have three attempts with exponential backoff; failed jobs remain for inspection.
Multiple cleanup processes sharing a queue namespace upsert the same scheduler identity.
Workers validate startup configuration and handle graceful shutdown. See
[media processing](docs/architecture/MEDIA_PROCESSING.md) and
[cleanup](docs/architecture/MEDIA_CLEANUP.md).

## Test commands

```sh
npm test
npm run test:tooling
npm test --workspace @album-manager/web
npm test --workspace @album-manager/api
npm run test:watch --workspace @album-manager/web
npm run test:watch --workspace @album-manager/api
# One colocated suite:
npm test --workspace @album-manager/web -- src/pages/upload/UploadPage.test.jsx
```

`npm test` runs the JavaScript/scaffold check, Node tooling tests, then workspace suites.
The default application suites use Fastify injection, transport/repository doubles,
React Testing Library and real small Sharp fixtures; external integrations are skipped.
Tooling checks include import boundaries, public indexes and application dependency cycles.

With isolated **local test services** configured:

```sh
DATABASE_TESTS=1 npm test --workspace @album-manager/api
QUEUE_TESTS=1 npm test --workspace @album-manager/api -- src/infrastructure/queue/queue.integration.test.js
STORAGE_TESTS=1 npm run test:storage --workspace @album-manager/api
# Full API suite with all three integrations enabled:
DATABASE_TESTS=1 QUEUE_TESTS=1 STORAGE_TESTS=1 npm test --workspace @album-manager/api
```

Database tests create disposable schemas, storage tests create temporary buckets, and
queue tests use unique namespaces. Never point these at production. The existing
`npm run test:database --workspace @album-manager/api` runs the schema suite only;
use `DATABASE_TESTS=1` with the full API suite for repository integration coverage.
See [testing responsibilities](docs/architecture/TESTING.md) for boundaries and limitations.

## Lint and format commands

```sh
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run check
```

ESLint rejects warnings, unused imports and broken hook rules, and restricts Prisma
construction/controller persistence/vendor-storage imports. Prettier owns formatting;
web files use its frontend override. `check` verifies scaffold/manifests/numbered rules
and absence of project TypeScript files/config/direct tooling, not application behavior.
The tooling test suite supplies the import-graph regression checks.

## Folder structure

```text
apps/
├── web/
│   ├── index.html, vite.config.js, jsconfig.json, package.json
│   └── src/
│       ├── app/                 # Router, providers, layouts, entry points
│       ├── pages/               # Route components, page hooks and page presentation
│       ├── features/            # album, category, dashboard, media, settings, tag, trash, upload
│       ├── components/          # Shared ui/common/media/layout presentation
│       ├── hooks/               # Generic domain-independent hooks
│       ├── services/            # HTTP errors/client and Query client
│       ├── utils/, constants/, config/, styles/, test/
│       └── store/               # Reserved; no global store implemented
└── api/
    ├── prisma.config.js, vitest.config.js, package.json
    ├── prisma/                  # Schema, migrations and connectivity-only seed
    └── src/
        ├── app/                 # Composition, routes, startup/shutdown
        ├── config/              # Validated server-only configuration
        ├── modules/             # albums, dashboard, health, media, settings, taxonomy, uploads
        │   └── <module>/        # controllers/services/repositories/validators/mappers/routes/index.js
        ├── infrastructure/      # database/storage/queue/image-processing; cache placeholder
        ├── shared/              # errors/middleware/validation/utils/constants
        └── jobs/                # Job service composition, workers, scheduler and entry points
packages/shared/                 # Runtime-independent placeholder workspace
infrastructure/
├── docker/s3ninja/              # Emulator and browser-endpoint proxy configuration
└── scripts/                     # Environment setup, scaffold and tooling tests
docs/
├── DEVELOPMENT.md
├── architecture/
├── database/
├── api/
└── superpowers/                 # Historical implementation plans/specifications
```

Tests are colocated with their responsibilities. Empty reserved directories use `.gitkeep`.
Root `infrastructure/` is development tooling; API `src/infrastructure/` is runtime adapters.

## Hook placement rules

| Responsibility                                                               | Location                    | Example                                              |
| ---------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| Page-specific filters, navigation, selection and cross-feature orchestration | `pages/<domain>/hooks/`     | `useUploadPage`, `useAlbumDetailPage`                |
| Reusable domain query/mutation/cache behavior                                | `features/<feature>/hooks/` | `useInfiniteMedia`, `useFileUploads`                 |
| Domain-independent browser/state behavior                                    | `src/hooks/`                | `useDebounce`, `useIdSelection`, `useMutationEditor` |

Page hooks consume feature public hooks/actions, not private API modules. Shared
`useIdSelection` and `flattenPaginatedItems` own generic ID operations; media exports
`useMediaSelection`/`flattenMediaPages` remain compatibility aliases. Keep domain logic
out of generic hooks, and reuse existing helpers before introducing new ones.

## Feature-boundary rules

- Pages/page hooks import features through `@/features/<feature>/index.js`.
- Feature hooks use their own private API adapters; adapters use `services/httpClient.js`.
  React pages/components do not call HTTP transport directly.
- Features never import pages. Shared frontend components/hooks/services/utils never
  import features, pages or application composition.
- Cross-feature/backend-module dependencies use the target public `index.js` and stay
  acyclic; private relative imports are for the owning feature/module only.
- Backend services use injected repositories/providers. Only database infrastructure
  constructs Prisma; repositories own queries/transactions. Shared/backend infrastructure
  does not depend on business modules or HTTP composition.
- `packages/shared` must be safe in either runtime and import neither application.

Frontend `@/` resolves to `apps/web/src`; backend native Node aliases are `#modules/*`,
`#infrastructure/*`, `#shared/*`, and `#config/*`. Use explicit `.js`/`.jsx` filenames.
Graph checks cover static and literal dynamic imports; they supplement responsibility
reviews rather than proving every runtime dependency or aliased transport call safe.

## Upload flow

1. The upload page validates selected files and queues them locally. Its page hook
   runs up to three independent file lifecycles and captures album/category/tag options.
2. The feature creates a session, registers filename/MIME/size, and requests a presigned
   PUT. The API selects an upload-scoped staging key and signs MIME and Content-Length.
3. The browser sends bytes directly to storage using fetch/XHR. Byte-transfer progress is
   separate from processing status; binary data never passes through API JSON handlers.
4. Completion verifies object size/MIME/ETag, creates media and copies an immutable
   original to its own key. It waits for BullMQ acceptance and returns without optimizing.
5. The feature polls session files across cursor pages. Duplicate decisions are explicit:
   `SKIP`, `USE_EXISTING`, or `KEEP_BOTH`; the final media ID may be an existing item.
6. After READY supplies a final media ID, the page hook assigns album/categories/tags
   through their public feature actions. SKIP supplies no ID and performs no assignments.
   Retry checkpoints retain completed transfers/assignments;
   cancellation stops local work, while already accepted server work may continue.

Client validation is not a replacement for server limits/type verification. Completion
retries recover failed queue acceptance without recreating media or overwriting originals.
The current design has no transactional outbox or automated orphan/staging reconciliation.
See [upload API](docs/api/UPLOADS.md) and the [upload feature](apps/web/src/features/upload/README.md).

## Image processing flow

The media worker validates the media/upload relationship, reads the recorded original,
hashes its original encoded bytes with SHA-256, and coordinates duplicate admission under
a checksum lock. Unresolved duplicates wait for the explicit decision flow.

Sharp then verifies decoded type against registration, rejects unsupported/multi-page
images and enforces a pixel limit. Dedicated services extract metadata and generate
WebP `OPTIMIZED`, `PREVIEW`, named `THUMBNAIL` renditions, plus an optional
`BLUR_PLACEHOLDER`. Defaults are 2560-pixel optimized bounds, 1600-pixel preview bounds,
and thumbnails of 800/400/200 pixels, with no enlargement and preserved aspect ratio.
Settings support `LOSSLESS`, `BALANCED`, `HIGH_QUALITY`, and `MAX_COMPRESSION`.

Derivative objects use separate content-addressed keys; rendition identity is
`(mediaId, type, format, name)`. Retries reuse existing recorded assets. Metadata and
READY are published after successful processing/persistence; failures remain retryable
through the job flow. Originals are never updated in place. Lossless encoding does not
make resizing/orientation/metadata transformations mathematically reversible.
See [image processing](docs/architecture/IMAGE_PROCESSING.md) and
[optimization settings API](docs/api/IMAGE_OPTIMIZATION_SETTINGS.md).

## Virtualized gallery architecture

`VirtualMediaGrid` is the shared domain component used by library/search/favorites/trash,
album media and the library picker. Feature infinite queries own opaque server cursors;
`flattenPaginatedItems` deduplicates overlapping pages while preserving item identity.

`useVirtualMediaGrid` measures viewport width, calculates columns/card geometry, and
uses TanStack Virtual to render only visible rows plus overscan. `MediaGridRow` slices
those rows and memoized `MediaCard` renders thumbnail-only `ResponsiveImage` sources.
Selection is controlled by page hooks through generic ID state. Filter changes select
separate query caches; library/search/album pages key their main grids to reset scroll.
Near-end loading guards duplicate requests using filter, cursor and loaded-item boundaries.
Loading, empty, refresh and cursor-retry UI keep existing results visible where possible.

The API uses stable ordering/tie-breakers and compact thumbnail projections; richer
metadata and original URLs have separate detail/download endpoints. Virtualization bounds
DOM work, not all cached page memory. Inactive gallery queries expire after one minute;
active loaded pages remain retained. Album management uses bounded offset pages, and
five-item dashboard recents do not need virtualization. See
[frontend performance review](docs/architecture/FRONTEND_PERFORMANCE_REVIEW.md) and
[backend performance](docs/architecture/PERFORMANCE.md).

## Troubleshooting

| Symptom                                               | Checks / resolution                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment generator exits with “already exists”     | Existing `.env` is preserved. Edit it; do not regenerate over local credentials.                                                                                                            |
| Compose refuses missing credentials                   | Fill/generated root `.env` values for PostgreSQL, Redis and S3; use `docker compose config --quiet`.                                                                                        |
| Port already in use / unhealthy service               | Inspect `docker compose ps` and service logs. Change published port and corresponding API endpoint values together. S3 Ninja may need the full startup wait.                                |
| API startup fails                                     | Check root config, PostgreSQL and Redis availability; run migrations and generate the client. Exported process variables override `.env`. Startup intentionally prints a sanitized message. |
| Prisma table/client errors                            | Run `npm run db:deploy` and `npm run db:generate`; ensure `DATABASE_URL` points to the intended local database.                                                                             |
| PostgreSQL password stopped working after `.env` edit | Initialization settings do not rotate an existing volume's role credentials. Rotate the role password or restore matching local configuration.                                              |
| Browser API requests hit Vite / return HTML           | Vite has no `/api` proxy. Set `VITE_API_BASE_URL=http://localhost:3000/api` and restart/rebuild. Root `PUBLIC_API_BASE_URL` is unused.                                                      |
| Browser request returns 403 / CORS error              | Match the exact `FRONTEND_ORIGIN`, including hostname and port. Restart API and recreate `s3-public` after root env changes. Preview and a changed Vite port have different origins.        |
| Upload reports missing bucket or storage error        | Create the private bucket via Ninja UI, check provider credentials/endpoints, and inspect emulator/proxy logs. API startup does not create buckets.                                         |
| Presigned URL fails / thumbnail expires               | Verify browser-reachable signing endpoint, exact signed method/headers, expiry and matching credentials. Never rewrite a signed URL; refetch for a fresh URL.                               |
| Upload stays PROCESSING                               | Start the media worker; verify shared Redis DB/prefix and inspect worker errors/failed jobs. Transfer completion is not processing completion.                                              |
| Duplicate waits for a decision                        | Choose skip/use existing/keep both in the queue; the worker deliberately pauses duplicate admission.                                                                                        |
| Video/animated image fails                            | Current worker supports validated single-image decoding, not video or multi-page processing.                                                                                                |
| Trash item cannot restore after failed purge          | Purge has already started. Retry permanent deletion after correcting storage availability/key issues; do not bypass its durable marker or key checks.                                       |
| API returns 429                                       | Respect `Retry-After`; quotas are per socket IP/API instance. Configure appropriate local limits rather than disabling validation.                                                          |
| SPA deep link returns host 404                        | Configure frontend hosting to fall back to `dist/index.html` for application routes.                                                                                                        |
| Integration tests are skipped                         | Enable the relevant `DATABASE_TESTS`, `QUEUE_TESTS` or `STORAGE_TESTS` flag and supply isolated local services.                                                                             |
| Worker memory spikes                                  | Originals/derivatives are buffered. Keep conservative upload/concurrency limits and profile before increasing them.                                                                         |

For implementation work, follow [DEVELOPMENT.md](docs/DEVELOPMENT.md). Known scaling and
verification limits are recorded in [performance](docs/architecture/PERFORMANCE.md),
[security](docs/architecture/SECURITY.md) and the [final architecture audit](docs/architecture/FINAL_AUDIT.md).
