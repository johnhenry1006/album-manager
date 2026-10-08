# Backend structure

The backend workspace uses this source tree:

```text
apps/api/src/
├── app/
├── config/
├── modules/
├── infrastructure/
│   ├── database/
│   ├── storage/
│   ├── queue/
│   ├── cache/
│   └── image-processing/
├── shared/
│   ├── errors/
│   ├── middleware/
│   ├── validation/
│   ├── utils/
│   └── constants/
└── jobs/
```

Fastify is the HTTP framework. `app/app.js` composes a testable instance;
`app/server.js` loads validated dotenv configuration and listens. Plugin registration
and graceful shutdown are separate focused modules in `app/`. A shared Fastify
plugin installs centralized errors at the root so child route scopes inherit it.
Health is the sole registered module under `/api`, with colocated Vitest inject tests.
Infrastructure adapters, business modules, and image processing remain unimplemented;
the local Compose services do not imply database/storage connections during startup.

Native Node aliases are configured in the workspace manifest: `#modules/*`,
`#infrastructure/*`, `#shared/*`, and `#config/*`. Include explicit `.js` filenames.
See [Code quality foundations](CODE_QUALITY.md) for alias and lint configuration.

## Responsibilities

| Location                          | Responsibility                                                            |
| --------------------------------- | ------------------------------------------------------------------------- |
| `app`                             | Application composition, route registration, and startup/lifecycle wiring |
| `config`                          | Validated backend environment configuration and server-only settings      |
| `modules`                         | Business modules with explicit public interfaces                          |
| `infrastructure/database`         | Database connection and persistence infrastructure                        |
| `infrastructure/storage`          | Storage provider abstraction and concrete adapters                        |
| `infrastructure/queue`            | Queue adapters and job dispatch infrastructure                            |
| `infrastructure/cache`            | Cache adapters                                                            |
| `infrastructure/image-processing` | Image processing integrations used by dedicated services/jobs             |
| `shared/errors`                   | Central error classes, mapping, and response conventions                  |
| `shared/middleware`               | Generic request middleware, including centralized error handling          |
| `shared/validation`               | Domain-independent validation support                                     |
| `shared/utils`                    | Generic pure helpers                                                      |
| `shared/constants`                | Backend-wide constants without business module dependencies               |
| `jobs`                            | Background job entry points and orchestration                             |

Root `infrastructure/` contains repository tooling; this application's
`src/infrastructure/` contains runtime adapters. Keep those responsibilities separate.

## Business module structure

Each future business module uses exactly this structure:

```text
modules/<feature>/
├── controllers/
├── services/
├── repositories/
├── validators/
├── mappers/
├── routes/
└── index.js
```

- `routes` defines endpoints, wires request validation, and selects controllers.
- `controllers` translates validated HTTP input into service calls and maps the
  result to an HTTP response. Controllers remain thin.
- `services` owns business logic and domain decisions, coordinating repositories
  and infrastructure abstractions. Keep HTTP framework objects out of services.
- `repositories` owns database queries and persistence operations through the
  database infrastructure. No route/controller may access the database directly.
- `validators` defines module-specific validation for external input.
- `mappers` converts persistence/domain data into explicit output contracts,
  keeping list payloads lightweight and excluding internal or sensitive fields.
- `index.js` exports the intended module interface and hides implementation details.

Create concrete modules only when a business feature is requested. The foundation
contains only the operational `health` module, without inventing a business feature.

## Dependency direction

```text
route
  ↓
controller
  ↓
service
  ↓
repository / infrastructure adapter
```

Repositories use database infrastructure. Services use provider abstractions
instead of hard-coding storage vendors, filesystem calls, or image processing
libraries. Application composition wires concrete implementations. Infrastructure
and shared code must not depend on HTTP controllers or application composition.
Shared code must not import business modules. Business modules must not import
another module's internals; use its public `index.js` when a dependency is needed,
and avoid circular dependencies.

Jobs enter the same service layer without passing through HTTP controllers.
They validate external job payloads and use centralized error conventions with
worker-appropriate logging/retry handling. Transport-specific behavior stays at
the HTTP or job boundary.

## Validation, errors, and security

Validate all external input, including route parameters, queries, request bodies,
uploads, configuration, and queue messages. Services enforce domain invariants;
boundary validation alone is not a substitute for those checks.

Controllers forward failures to centralized error handling rather than inventing
per-endpoint response formats. Error responses must not expose stack traces,
credentials, or private adapter details. Backend secrets stay in backend config
and must never enter browser builds, shared packages, or API payloads.

The MVP is single-user. Do not add implicit `currentUser`, ownership filters,
authentication middleware, or invented user identifiers. Authentication and its
data model require a deliberate later design.

## Media and collection constraints

- Access storage exclusively through a provider abstraction.
- Preserve original media unchanged; create derivatives at separate locations.
- Run image transformations in dedicated services/jobs. Upload HTTP requests
  may await durable storage and job acceptance, but not transformation completion.
- Paginate large collections; return compact metadata and thumbnail/preview
  references in list responses, never original media bytes or bulky detail fields.
- Cursor pagination uses deterministic ordering with a stable tie-breaker such
  as `(sortField, id)`. Queries and cursors must share ordering, direction, and
  tie-breaker semantics to avoid skipping or duplicating equal-sort-value records.

## Tests and documentation

Each future feature includes tests appropriate to its behavior: pure domain
logic, service coordination, repository pagination, validation, errors, and HTTP
contracts where applicable. Keep tests close to their responsibility without
introducing an alternative top-level structure.

Document schema and migration decisions in `docs/database`, and endpoint/error/
pagination contracts in `docs/api`. Neither schema nor endpoints are implemented
in the foundation phase. Follow the file size guidance in
[Architecture rules](ARCHITECTURE_RULES.md).
