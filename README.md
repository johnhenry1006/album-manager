# Album Manager

A foundation for a visual album and media collection manager. The repository includes
architecture rules, local development infrastructure, and a JavaScript Fastify API
with a health endpoint. Business features, application database schemas,
authentication, media processing, and UI screens have not been implemented.

## Repository structure

```text
album-manager/
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── jsconfig.json
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── app/
│   │       │   ├── router/
│   │       │   ├── providers/
│   │       │   └── layouts/
│   │       ├── pages/
│   │       ├── features/
│   │       ├── components/
│   │       │   ├── ui/
│   │       │   ├── common/
│   │       │   ├── media/
│   │       │   └── layout/
│   │       ├── hooks/
│   │       ├── services/
│   │       ├── store/
│   │       ├── utils/
│   │       ├── constants/
│   │       ├── config/
│   │       ├── styles/
│   │       └── test/
│   └── api/
│       ├── package.json
│       ├── vitest.config.js
│       └── src/
│           ├── app/
│           │   ├── app.js
│           │   ├── server.js
│           │   ├── registerPlugins.js
│           │   └── registerShutdown.js
│           ├── config/
│           ├── modules/
│           │   └── health/
│           ├── infrastructure/
│           │   ├── database/
│           │   ├── storage/
│           │   ├── queue/
│           │   ├── cache/
│           │   └── image-processing/
│           ├── shared/
│           │   ├── errors/
│           │   ├── middleware/
│           │   ├── validation/
│           │   ├── utils/
│           │   └── constants/
│           └── jobs/
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
├── infrastructure/
│   ├── docker/
│   │   └── s3ninja/
│   │       ├── instance.conf
│   │       └── public-endpoint.conf.template
│   └── scripts/
│       ├── check-foundation.js
│       ├── code-quality.test.js
│       ├── setup-local-env.js
│       └── setup-local-env.test.js
├── docs/
│   ├── architecture/
│   │   ├── ARCHITECTURE_RULES.md
│   │   ├── FRONTEND_STRUCTURE.md
│   │   ├── BACKEND_STRUCTURE.md
│   │   └── CODE_QUALITY.md
│   ├── database/
│   └── api/
├── docker-compose.yml
├── package.json
├── package-lock.json
├── .editorconfig
├── .gitignore
├── eslint.config.js
├── .prettierrc.json
├── .prettierignore
├── .env.example
└── README.md
```

Empty directories contain `.gitkeep` files so Git preserves the scaffold.
Health is the only API module. Business modules are intentionally absent;
their future layout is documented. API tests are colocated with their responsibilities.

## Workspace setup

Use Node.js 22.14 or later and npm 10 or later. All workspaces are private and use
JavaScript ES modules. Install from the repository root:

```sh
npm ci
npm run check
```

The API workspace owns Fastify, dotenv, fastify-plugin, Prisma/PostgreSQL tooling, and Vitest. Root development
dependencies provide ESLint, Prettier, Vite alias resolution, and tooling tests.
`package-lock.json` records workspace links and tooling versions.
Add future application dependencies to their owning workspace
with `npm install <package> --workspace @album-manager/web` (or `/api` or `/shared`
in place of `/web`), and commit the updated root lockfile.

The check verifies required folders/files, private ES-module workspace manifests,
the numbered rule list, and absence of TypeScript source/configuration/dependencies
in repository-owned files. It excludes dependencies, generated output, and local
tool metadata. It does not enforce import boundaries or test application behavior;
add appropriate linting and tests when application code is introduced.

The API workspace provides `dev` and `start` commands; the frontend still has no
application entry point or dev/build command. Vite supplies frontend alias configuration.
Docker Compose provides the local PostgreSQL, Redis, and S3 Ninja services described
below. `infrastructure/docker` holds emulator/container configuration and
`infrastructure/scripts` holds repository tooling.

Docker Compose and the API load the root `.env`. The API validates its own settings
and gives existing process variables precedence. Browser-visible values are public,
and credentials stay backend-only.

## API development

Install dependencies with `npm ci`, then run from the repository root:

```sh
npm run dev --workspace @album-manager/api
# Or start without file watching:
npm start --workspace @album-manager/api
curl http://127.0.0.1:3000/api/health
```

The response is JSON with `status: "ok"`, an ISO timestamp, and `version` from the
API package manifest when available. This is process liveness, not readiness of
PostgreSQL, Redis, or storage. The production server requires PostgreSQL before listening;
health/application tests inject dependencies and do not require Docker.

Configuration accepts `NODE_ENV` (`development`, `test`, `production`), `API_HOST`
(default `127.0.0.1`), `API_PORT` (default `3000`, range `1–65535`), `LOG_LEVEL`
(`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`; default `info`), and
`API_SHUTDOWN_TIMEOUT_MS` (default `10000`, range `1–120000`). Invalid settings fail
before listening. The root `.env` path is resolved from the source file, so the
workspace command works independently of the shell's current directory. A missing
`.env` is allowed when configuration is supplied through the process environment
or local defaults. Existing infrastructure values are not copied into public app config.

`src/app/app.js` builds an instance without loading dotenv, opening sockets, or
installing process listeners. An injected database owner connects on readiness and
disconnects on close. `registerPlugins.js` registers shared error handling
and the API route scope. `server.js` loads validated configuration, listens, and
wires the shutdown helper. SIGINT/SIGTERM stop accepting requests, close Fastify
and its hooks once, and remove listeners. The shutdown deadline forces a nonzero
exit if resources fail to close; startup/close failures also exit unsuccessfully.
Fastify emits structured request/completion logs. Centralized errors return a
status code, stable error code, safe message, and request ID without stack traces
or private exception messages.

Run API tests once, watch them, or run the whole repository suite:

```sh
npm test --workspace @album-manager/api
npm run test:watch --workspace @album-manager/api
npm test
```

Vitest runs API tests in Node with Fastify `inject`, without listening on a port.
The root command runs scaffold checks, Node tooling tests, then workspace test scripts.

## Database foundation

Prisma uses a JavaScript config and the initial single-user PostgreSQL schema.
The server and CLI load root `.env`; `DATABASE_URL` overrides the existing local
`POSTGRES_*` settings. Generate the client after installation and schema changes:

```sh
npm run db:generate
npm run db:migrate -- --name <change>
npm run db:deploy
npm run db:seed
npm run db:studio
```

Generation does not require PostgreSQL. Migration, deployment, seed, and Studio
commands need configured database access. The initial migration creates the album,
media, taxonomy, global favorite, upload, metadata, and settings models; authentication
is deferred. The seed foundation verifies connectivity without writing data. Repository factories
receive the application-owned client; controllers call services.
See [Database conventions](docs/database/DATABASE_RULES.md) for lifecycle,
schema naming, UUIDs, timestamps, deletion, indexes, and migration workflows.
See [Schema](docs/database/SCHEMA.md) for relationships and integrity guarantees.

## Local development infrastructure

Install Docker Engine/Desktop with Docker Compose v2. From the repository root,
generate your ignored local environment file and start the services:

```sh
node infrastructure/scripts/setup-local-env.js
docker compose config --quiet
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

The setup script generates random PostgreSQL/Redis passwords and S3 credentials,
creates `.env` with owner-only permissions, and refuses to overwrite an existing
file. Alternatively, copy `.env.example` to `.env` and fill all four blank
credential values yourself. Compose refuses to start with missing credentials.
No secrets are committed; `.env` is ignored. Do not publish expanded Compose
configuration or the emulator UI, which can reveal local credentials.

Default service addresses:

| Service                  | Host address               | Address within the Compose network |
| ------------------------ | -------------------------- | ---------------------------------- |
| PostgreSQL               | `localhost:5434`           | `postgres:5432`                    |
| Redis                    | `localhost:6380`           | `redis:6379`                       |
| S3-compatible endpoint   | `http://localhost:9445`    | `http://s3ninja:9000`              |
| S3 Ninja bucket/admin UI | `http://localhost:9445/ui` | `http://s3ninja:9000/ui`           |

Ports are bound exclusively to `127.0.0.1` and can be changed with `POSTGRES_PORT`,
`REDIS_PORT`, and `S3_PORT`. If you change a port, update the corresponding host-run
backend endpoint values in `.env`, including `S3_PUBLIC_ENDPOINT`.

Containers use predictable names: `album-manager-postgres`, `album-manager-redis`,
`album-manager-s3ninja`, and `album-manager-s3-public`. The last container is an
Nginx sidecar providing complete browser CORS; it is the only published S3 port.
All containers use the dedicated `album-manager_local` bridge network and are
separate from other projects' networks. This is not a Docker `internal` network:
host port publishing must work for the host-run backend and browser. The stack
does not join external/shared networks. `COMPOSE_PROJECT_NAME` changes the container,
network, and named-volume prefixes if another instance is needed.

Each container has a health check. PostgreSQL stores data in `postgres-data`, Redis
uses AOF persistence in `redis-data`, and S3 Ninja uses named data, multipart, and
log volumes. Names receive the project prefix. Stop and remove containers/network
while preserving all data with:

```sh
docker compose down
```

To stop containers without removing them, use `docker compose stop`; restart with
`docker compose up -d --wait`. Inspect logs with `docker compose logs -f`.
`docker compose down --volumes` deletes local data and is only for an intentional reset.
PostgreSQL initialization credentials apply when its volume is first created;
changing `.env` does not change an existing database password. Rotate that password
through PostgreSQL before changing the corresponding environment value.

## Local S3 bucket and browser requests

After startup, open `http://localhost:9445/ui`, enter `album-manager` in **New Bucket**,
and create it. Leave the bucket private; do not enable public access. Bucket creation
is a one-time step because the named volume preserves it. Automatic bucket creation
is disabled. If `S3_BUCKET` is changed, create that bucket explicitly instead.

The backend storage provider uses these server-only configuration values:

- `STORAGE_DRIVER=s3`: selects the S3-compatible adapter, including local S3 Ninja.

- `S3_ENDPOINT`: backend operations endpoint; default `http://localhost:9445` when
  the API runs on the host. A future API container on this network uses
  `http://s3ninja:9000` instead.
- `S3_PUBLIC_ENDPOINT`: endpoint used when signing URLs returned to the browser;
  default `http://localhost:9445`. The browser cannot resolve Compose service names.
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`: generated server-only credentials, shared with
  the local emulator. They must never be sent to frontend code.
- `S3_REGION=us-east-1`, `S3_BUCKET=album-manager`, and `S3_FORCE_PATH_STYLE=true`.
  Object paths use `/album-manager/<object-key>`.

Use separate endpoint configuration for backend operations and browser URL signing
when their hostnames differ. Sign browser URLs using `S3_PUBLIC_ENDPOINT` from the
start; never replace the hostname, port, or path after signing. Those fields affect
the signature. The sidecar forwards the original host/path without rewriting them.
For remote development, use a browser-reachable public endpoint and matching local
port forwarding; `localhost` always means the browser's own machine.

`FRONTEND_ORIGIN=http://localhost:5173` configures the exact allowed browser origin
(scheme, hostname, and port). Set it to the actual frontend origin and recreate
the sidecar after changes:

```sh
docker compose up -d --force-recreate s3-public
```

The sidecar handles OPTIONS preflights, permits `PUT`, `GET`, and `HEAD`, echoes
requested headers, exposes `ETag`, `Content-Length`, `Content-Range`,
`x-amz-request-id`, and `x-amz-version-id`, and supplies CORS headers on error
responses. Other origins receive no allowed-origin header. Browser requests use
the presigned URL with cookies omitted, the signed HTTP method, and any signed
headers exactly as agreed with the backend. CORS does not bypass S3 authentication.

S3 Ninja 8.7.3's native permissive preflight omits HEAD and does not provide the
required origin-specific policy. Its native CORS is therefore disabled; the
infrastructure proxy owns CORS. Do not rely on `aws s3api put-bucket-cors` for this
emulator. Production storage must configure its own equivalent bucket/provider
CORS policy. All emulator-specific configuration stays under `infrastructure/docker`;
future application code must use the generic storage provider abstraction and
standard S3 operations, never the emulator's UI routes.

To check the configured browser preflight (replace the default origin/port if changed):

```sh
curl -i -X OPTIONS http://localhost:9445/album-manager/check.txt \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type,x-amz-meta-purpose'
```

Expect `204`, the exact allowed origin, and `PUT, GET, HEAD, OPTIONS`. Repeat with
`GET` and `HEAD`. Run `npm run test:storage --workspace @album-manager/api` for an
isolated temporary-bucket smoke test of the provider and presigned PUT/GET/HEAD.
See [Storage abstraction](docs/architecture/STORAGE.md) for key generation, injection,
and the provider contract. No media upload workflow or endpoints are implemented.
The [S3 Ninja documentation](https://s3ninja.net/)
describes its local endpoint, path-style addressing, and persistent data directory.

## Architecture decisions

- npm workspaces separate the browser application, backend application, and
  runtime-independent shared contracts/utilities without alternative top-level layouts.
- Frontend pages stay thin. Page hooks compose feature hooks/actions through public
  `index.js` exports; feature hooks own TanStack Query. Shared frontend modules
  never import features or pages, and pages never call the HTTP client directly.
- Backend routes call thin controllers, controllers call services, and services
  use repositories or infrastructure adapters. Repositories own database access.
- Storage uses provider abstractions; dedicated services/jobs create derivatives
  while preserving originals. Large collections use pagination, gallery views use
  virtualization, and lists use lightweight metadata and thumbnails/previews.
- Validation and errors are centralized at the documented boundaries. The MVP is
  single-user until authentication is deliberately introduced.

Read these documents before adding code:

1. [Mandatory architecture rules](docs/architecture/ARCHITECTURE_RULES.md)
2. [Frontend structure and import boundaries](docs/architecture/FRONTEND_STRUCTURE.md)
3. [Backend structure and dependency direction](docs/architecture/BACKEND_STRUCTURE.md)
4. [Code quality, commands, and aliases](docs/architecture/CODE_QUALITY.md)

Quality commands from the repository root:

```sh
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm test
```

Frontend aliases use `@/` through JavaScript editor configuration and Vite.
Backend aliases use native Node `#` package imports without a custom loader.
Tests verify repository/tooling foundations and the API health/configuration/lifecycle contracts.

Future database decisions belong in `docs/database`; API contracts belong in
`docs/api`. JavaScript only: do not introduce TypeScript or speculative features.
