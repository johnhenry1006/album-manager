# Mandatory architecture rules

These rules apply to all workspaces and all new code. Read them together with
[Frontend structure](FRONTEND_STRUCTURE.md) and
[Backend structure](BACKEND_STRUCTURE.md). The initial repository is a foundation
only; these documents define how future application code must be organized.

## Mandatory rules

1. JavaScript only.
2. No TypeScript.
3. Pages must remain thin.
4. Controllers must remain thin.
5. Business logic belongs in services/domain modules.
6. Database access belongs in repositories.
7. API calls must not live directly inside React page components.
8. TanStack Query logic belongs in reusable feature hooks.
9. Page-specific orchestration belongs in page hooks.
10. Reusable domain hooks belong in feature hooks.
11. Generic domain-independent hooks belong in `src/hooks`.
12. Reuse existing modules before creating new ones.
13. Do not duplicate logic.
14. Do not create random folders.
15. Respect feature boundaries.
16. Shared/common layers must never depend on page-specific code.
17. Features must never import from pages.
18. Files should remain focused and reasonably small.
19. Split files by responsibility, not by line count alone.
20. Prefer pure functions where possible.
21. Storage must be accessed through a provider abstraction.
22. Image processing must run through dedicated services/jobs.
23. Original media must never be modified in place.
24. Large media collections must use pagination.
25. Large gallery views must use virtualization.
26. Grid/list pages must never load original image files.
27. List API payloads must remain lightweight.
28. Background processing must not block upload HTTP requests.
29. All externally supplied input must be validated.
30. Errors must use centralized error handling.
31. Security-sensitive credentials must never be exposed to the frontend.
32. New code must follow the existing structure before adding abstractions.
33. If a file grows too large or has mixed responsibilities, refactor it.
34. Every new feature should include appropriate tests.
35. Page hooks must not import from feature `api/` directories directly.
36. Page hooks should consume feature hooks/actions through the feature public `index.js`.
37. Shared/common frontend modules must not import from features or pages.
38. Cross-feature imports must use the target feature public `index.js` unless explicitly documented.
39. Cursor pagination must use deterministic ordering with a stable tie-breaker such as `(sortField, id)`.
40. The MVP is single-user until authentication is deliberately introduced; do not invent implicit current-user behavior.

## Recommended file size guidance

| Responsibility           | Preferred size   |
| ------------------------ | ---------------- |
| React page               | <= 150 lines     |
| React reusable component | <= 200 lines     |
| Page hook                | <= 200–250 lines |
| Feature hook             | <= 150–200 lines |
| Backend controller       | <= 150 lines     |
| Backend service          | <= 250–300 lines |
| Repository               | <= 200 lines     |
| Utility                  | <= 150 lines     |

These are guidance, not blind hard limits. Review responsibilities, cohesion,
and testability before splitting a file. A small file can still mix responsibilities;
a longer file can remain cohesive. Refactor by responsibility.

## Coding conventions

- Use JavaScript ES modules (`import`/`export`), `.js` for non-JSX code, and
  `.jsx` for React components when a frontend toolchain is introduced. Do not add
  `.ts`, `.tsx`, declaration files, TypeScript configuration, or TypeScript tooling.
- Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, and final newlines.
- Use descriptive names and explicit module exports. Each future feature exposes
  a deliberate public API through `index.js`; internal files stay internal.
- Keep rendering, orchestration, domain decisions, persistence, and external
  integrations in their documented layers. Avoid circular dependencies.
- Keep server-only configuration and credentials in `apps/api`; browser-visible
  configuration is public. `packages/shared` must be safe for either runtime.
- Validate requests, configuration, job payloads, and other external input at
  their entry boundaries. Map failures through the centralized error layer;
  avoid leaking internal details or secrets into responses.
- Keep originals immutable; write derived media separately through the storage
  provider. Serve thumbnail/preview references and compact metadata in lists.
- A future cursor must encode all ordering fields. Use the same ordering and
  tie-breaker in the database query and cursor comparison, including when sort
  values are equal. Define null ordering explicitly when relevant.
- Future upload handlers may await persistence and job acceptance, but must not
  wait for image transformation work. Dedicated jobs own that processing.
- Add tests for the behavior and boundaries of each future feature. The scaffold
  check is not a substitute for application tests, import-boundary linting, or
  security validation once application code exists.

## Naming conventions

- React component names and files: PascalCase, such as `MediaCard.jsx`.
- Hook names and files: `useXxx`, such as `useSelection.js`.
- Utility functions and files: camelCase, such as `formatDate.js`.
- Feature API modules: `xxxApi.js`, such as `mediaApi.js`.
- Query key modules: `xxxQueryKeys.js`, such as `mediaQueryKeys.js`.
- Backend services: `xxx.service.js`, such as `media.service.js`. Use the same
  suffix convention for controllers, repositories, validators, and mappers
  (`xxx.controller.js`, `xxx.repository.js`, `xxx.validator.js`, `xxx.mapper.js`).
- Constants: `UPPER_SNAKE_CASE` for fixed values, such as `DEFAULT_PAGE_SIZE`;
  structured query-key factories and ordinary objects use descriptive camelCase.

These names are illustrative conventions only; no example features are implemented.
See [Code quality foundations](CODE_QUALITY.md) for commands, aliases, and tooling.

## Repository boundaries

- `apps/web` owns the browser application.
- `apps/api` owns the HTTP application, backend modules, adapters, and jobs.
- `packages/shared` owns runtime-independent contracts, constants, validation
  helpers, and pure utilities that truly need sharing across applications.
  It must never import from either application or contain backend credentials.
- Root `infrastructure/docker` and `infrastructure/scripts` own development and
  deployment tooling. `apps/api/src/infrastructure` owns application adapters.
- `docs/architecture`, `docs/database`, and `docs/api` own architecture, database,
  and API documentation respectively. Add files within these locations as needed.

Do not pre-create business modules, storage implementations, schemas, endpoints,
authentication, or speculative abstractions during the foundation phase.

See [Security boundaries](SECURITY.md) for the single-user trust model and implemented protections.
