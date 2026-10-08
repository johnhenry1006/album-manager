# Frontend structure

The frontend workspace is `apps/web`. Its source tree is:

```text
src/
├── app/
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

These directories are scaffolded without application implementations. React,
TanStack Query, and routing can be installed when application work begins.
Vite is configured only for source alias resolution; there is no application
entry point yet. See [Code quality foundations](CODE_QUALITY.md) for `@/` aliases
and quality commands. The boundaries below apply to all future application code.

## Responsibilities

| Location            | Responsibility                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| `app/router`        | Route registration and route composition                                   |
| `app/providers`     | Application-wide provider composition                                      |
| `app/layouts`       | Route shells and layout composition                                        |
| `pages`             | Thin route-facing React components and page-specific orchestration         |
| `features`          | Business-domain UI, services/domain logic, hooks, actions, and API modules |
| `components/ui`     | Domain-independent visual primitives                                       |
| `components/common` | Reusable components with no feature or page dependencies                   |
| `components/media`  | Reusable media presentation primitives, independent of feature data access |
| `components/layout` | Reusable layout primitives used by application shells                      |
| `hooks`             | Completely domain-independent reusable hooks                               |
| `services`          | Generic infrastructure clients, including the future HTTP client           |
| `store`             | Generic client state infrastructure; domain state belongs to its feature   |
| `utils`             | Domain-independent pure helpers                                            |
| `constants`         | Shared frontend constants without feature dependencies                     |
| `config`            | Validated public frontend configuration                                    |
| `styles`            | Global styling foundations                                                 |
| `test`              | Shared test setup, fixtures, and helpers                                   |

Feature-specific components and helpers stay inside their feature. Promote them
to shared layers only when their responsibility is genuinely shared and they
can remain independent of features/pages. `packages/shared` is for cross-application
contracts and pure helpers, not a replacement for frontend shared folders.

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
