# Album Manager

A foundation for a visual album and media collection manager. This repository
currently contains only structure, architecture rules, and configuration.
Application features, runtime servers, database schemas, authentication, media
processing, and UI screens have not been implemented.

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
│       └── src/
│           ├── app/
│           ├── config/
│           ├── modules/
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
│   └── scripts/
│       ├── check-foundation.js
│       └── code-quality.test.js
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
Business modules are intentionally absent; their future layout is documented.

## Workspace setup

Use Node.js 22.14 or later and npm 10 or later. All workspaces are private and use
JavaScript ES modules. Install from the repository root:

```sh
npm ci
npm run check
```

The initial workspaces have no application dependencies. Root development
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

No `dev`, `start`, or `build` commands exist yet because there is no runtime
application entry point. Vite currently supplies only frontend alias configuration.
Docker Compose contains an empty services
map and starts no containers. Use `infrastructure/docker` for future container
definitions and `infrastructure/scripts` for repository tooling.

`.env.example` documents configuration intent only. Future runtime composition
must load and validate configuration; neither npm nor application code currently
loads `.env`. Browser-visible values are public, and credentials stay backend-only.

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
Tests currently verify repository/tooling foundations, not application behavior.

Future database decisions belong in `docs/database`; API contracts belong in
`docs/api`. JavaScript only: do not introduce TypeScript or speculative features.
