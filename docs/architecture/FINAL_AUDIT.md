# Final repository architecture audit

Reviewed 2026-10-09 against `ARCHITECTURE_RULES.md`, `FRONTEND_STRUCTURE.md`,
`BACKEND_STRUCTURE.md`, `PERFORMANCE.md`, `SECURITY.md`, and `TESTING.md`.
These documents were read before changes. Scope includes both applications,
the shared package, manifests/lockfile, Prisma schema/migrations, tooling,
infrastructure, configuration and tests. Dependency/build output and local
credential directories are excluded from application-source findings.

## Violations found and fixes

1. **Generic hook inside a feature:** `useMediaSelection` used only React and
   generic IDs/Sets. Its implementation now lives in `src/hooks/useIdSelection.js`.
   Album detail, favorites, search and trash page hooks consume the shared hook.
   The old media export remains a compatibility alias with no duplicated logic.
2. **Generic utility owned by a domain:** `flattenMediaPages` deduplicated generic
   `{ items: [{ id }] }` pages. Its implementation now lives in
   `src/utils/flattenPaginatedItems.js`. Media, album and trash query hooks consume
   it directly, removing unnecessary cross-feature dependencies. The old media
   export remains a compatibility alias.
3. **Missing automated import-graph protection:** Existing lint covered Prisma
   construction, controller persistence and storage adapters, but did not check
   frontend feature/public-index boundaries or cycles. The existing Node tooling
   suite now parses application JavaScript/JSX with ESLint and checks static imports,
   re-exports and literal dynamic imports, relative paths and aliases, unresolved
   local targets, production imports of tests, forbidden direct HTTP transport,
   and production import cycles. Negative fixtures exercise the guard itself.

Selection operations, callback identity, ordering, first-occurrence deduplication,
item identity, query keys, pagination and public feature exports are preserved.
No endpoint, schema, dependency, storage or processing behavior changed.

## Requested checks

| #   | Concern                                        | Finding / disposition                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Accidental TypeScript files/dependencies       | No project TS/TSX/MTS/CTS files, declaration files, tsconfig or direct TypeScript tooling/type dependencies. Existing transitive `@types/*` packages belong to upstream JavaScript dependencies, including Prisma Studio and test tools; no TypeScript compiler package is locked.                                                                                             |
| 2   | Pages with excessive logic                     | Route pages compose presentation and page hooks. No business/request logic found that needs extraction.                                                                                                                                                                                                                                                                        |
| 3   | Business logic in controllers                  | Controllers delegate to services and translate validated input/status/output. Upload status-to-HTTP mapping is transport behavior.                                                                                                                                                                                                                                             |
| 4   | Prisma outside repositories/infrastructure     | Client construction is confined to database infrastructure. Queries/transactions are in repositories, including repository helper `mediaWrite.js`; composition only injects clients.                                                                                                                                                                                           |
| 5   | API calls in React pages/components            | HTTP calls live in feature API adapters and generic transport. Page hooks consume public feature hooks/actions; components only invoke supplied callbacks/query actions.                                                                                                                                                                                                       |
| 6   | Domain hooks in `src/hooks`                    | No domain orchestration found; generic hooks depend on React/browser primitives.                                                                                                                                                                                                                                                                                               |
| 7   | Generic hooks inside features                  | Fixed generic selection placement. Remaining feature hooks own domain queries, cache policy, upload state, filters or media geometry.                                                                                                                                                                                                                                          |
| 8   | Duplicate hooks                                | No duplicate implementations requiring consolidation found. Page filter wrappers and distinct domain query hooks are intentional compositions.                                                                                                                                                                                                                                 |
| 9   | Duplicate services                             | No duplicate service implementation requiring consolidation found. Taxonomy shares CRUD/assignment responsibilities; gallery signing, lifecycle/shutdown and media purge behavior already have focused shared implementations.                                                                                                                                                 |
| 10  | Duplicate utility functions                    | No duplicate implementation requiring consolidation found. Moved generic page flattening to its proper shared owner. Browser file validation and server validation serve separate trust boundaries.                                                                                                                                                                            |
| 11  | Large files with mixed responsibilities        | Production pages/controllers/repositories are small. The 259-line upload lifecycle service is cohesive checkpoint/retry/cancellation orchestration with separate transport and validation; no line-count-only split was made. Larger test suites cover related behaviors.                                                                                                      |
| 12  | Circular dependencies                          | Production application import graph is acyclic, including public-index re-export edges. New regression guard checks it.                                                                                                                                                                                                                                                        |
| 13  | Features importing pages                       | None found; guarded.                                                                                                                                                                                                                                                                                                                                                           |
| 14  | Shared/common importing feature/page internals | None found. Shared package remains application independent; backend foundations do not import business modules. Guarded.                                                                                                                                                                                                                                                       |
| 15  | Unnecessary private cross-feature imports      | None found. Cross-feature imports use public indexes; within-feature imports remain private relative imports. Guarded.                                                                                                                                                                                                                                                         |
| 16  | Media grids without virtualization             | Library, search, favorites, trash, album media and album picker use `VirtualMediaGrid`/TanStack Virtual. Dashboard lists are bounded at five; album management is bounded at 48 cards/page.                                                                                                                                                                                    |
| 17  | List endpoints without cursor pagination       | Media, trash, album-media, upload files and cleanup use deterministic cursors. Album/category/tag management intentionally retains bounded offset pages and totals under documented contracts. Category tree is an explicit unpaginated exception; bounded dashboard recents are not an unbounded collection endpoint. See debt below.                                         |
| 18  | Excessive gallery metadata                     | Explicit gallery projections omit original keys/files, EXIF, checksum, detailed metadata and full memberships; signed thumbnails replace storage keys. Historical thumbnail counts and album descriptions remain documented payload risks.                                                                                                                                     |
| 19  | Originals loaded by grids                      | Grid cards select thumbnail variants. Dashboard recent media/albums use supplied thumbnails. Original URLs are obtained only through explicit detail actions.                                                                                                                                                                                                                  |
| 20  | Storage coupled to S3 Ninja                    | Business code consumes injected provider abstractions. S3-compatible SDK code is confined to adapters; Ninja endpoint/proxy setup belongs to development infrastructure.                                                                                                                                                                                                       |
| 21  | Image processing in HTTP controllers           | None. Dedicated services/jobs own processing through an injected processor.                                                                                                                                                                                                                                                                                                    |
| 22  | Upload requests waiting for optimization       | Completion awaits original persistence and queue acceptance, then returns. Transformations execute in the worker; retries do not recreate the original.                                                                                                                                                                                                                        |
| 23  | Missing error handling                         | Centralized safe HTTP envelopes, frontend error normalization/retry states and worker failure propagation are present. Intentional secondary-cleanup catches preserve the primary failure; owning tasks surface upload errors.                                                                                                                                                 |
| 24  | Missing validation                             | Routes/schemas, services, environment settings, storage keys and job payloads validate their boundaries. Domain invariants are enforced before persistence or deletion.                                                                                                                                                                                                        |
| 25  | Missing critical-flow tests                    | Existing coverage includes immutable originals, queue acceptance/retry, duplicate decisions, processing failures, purge confinement/recovery, pagination ties, confirmation cancellation, cache/transport behavior and upload assignment retries. Added shared selection/deduplication tests and repository import-graph checks. External-service verification remains opt-in. |

## Refactored and added files

- New shared implementations/tests: `apps/web/src/hooks/useIdSelection.js`,
  `useIdSelection.test.js`, `apps/web/src/utils/flattenPaginatedItems.js`,
  `flattenPaginatedItems.test.js`.
- Compatibility aliases: `apps/web/src/features/media/hooks/useMediaSelection.js`
  and `apps/web/src/features/media/utils/flattenMediaPages.js`.
- Query consumers: media `useInfiniteMedia.js`, album `useInfiniteAlbumMedia.js`,
  trash `useInfiniteTrash.js` in their existing feature hook directories.
- Page consumers: album `useAlbumDetailPage.js`, favorites `useFavoritesPage.js`,
  search `useSearchPage.js`, trash `useTrashPage.js` in their existing page hook
  directories.
- Architecture regression tests: `infrastructure/scripts/architecture.test.js`.
- Formatting only: `packages/shared/package.json` had an existing indentation
  mismatch with Prettier; fields and dependency declarations are unchanged.
- Documentation: this report, `FINAL_AUDIT_PLAN.md`, and the media feature README.

## Remaining technical debt and verification limits

- Offset album/category/tag pages and exact counts can become expensive at large
  offsets. The category tree loads the complete hierarchy. Cursor migration/tree
  changes require deliberate API/UI contract work; changing them during this audit
  would violate behavior preservation.
- Gallery signing includes all historical/imported thumbnails. Album lists retain
  descriptions up to 5000 characters. Measure response bytes before changing
  projections or limits; normal processing already bounds configured thumbnail sizes.
- Workers buffer originals; some storage operations run under database locks.
  Large files/high concurrency need memory/lock measurements and recovery-aware
  changes. Failed-job retention and orphan/staging reconciliation remain operational
  responsibilities.
- Dashboard aggregate caching and HTTP rate limits are instance local. Storage
  statistics are uncached. Deployment/authentication limitations remain as documented
  in `PERFORMANCE.md` and `SECURITY.md`; no implicit user model was introduced.
- Default suites skip real PostgreSQL/Redis/storage integrations. Browser layout,
  deployment CORS/TLS/provider enforcement and production-scale query/memory profiles
  were not established by this audit. Existing opt-in suites cover those external
  persistence/provider contracts when run with isolated local services.
- The graph guard covers static and literal dynamic imports in application source.
  It does not resolve computed runtime imports, detect every possible aliased network
  call, or infer business responsibilities; manual review and existing lint remain
  necessary. Compatibility aliases can be removed in a future deliberate public API
  cleanup.

## Verification

- `npm test`: 16 tooling tests, 445 frontend tests and 694 backend tests passed;
  113 external-service backend tests skipped. Initial sandbox run stopped at
  existing tooling subprocess restrictions (`EPERM`); approved escalation passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run build --workspace @album-manager/web`: passed.
- `git diff --check`: passed.
- JavaScript-only foundation check passed. No dependencies were added or modified.
- Independent code review found no critical or important issues; its targeted
  frontend run also passed 19 tests. The graph guard's syntactic limits are
  recorded above.

**JavaScript-only requirement remains satisfied for project code and direct tooling.**
Upstream transitive declaration packages are present and are explicitly distinguished
from introducing TypeScript into this repository.
