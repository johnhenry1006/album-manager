# Testing coverage implementation plan

**Goal:** Complete behavior and architecture-boundary coverage using the existing test infrastructure.

**Architecture:** Colocate tests with their responsibility. Use injected repositories/providers for service tests, real Fastify injection for HTTP tests, and React Testing Library with real hooks for frontend behavior. Preserve existing PostgreSQL, S3 and Redis opt-in suites.

**Tech stack:** JavaScript, Vitest, React Testing Library, Fastify inject.

**Spec:** User request and `docs/architecture/ARCHITECTURE_RULES.md`.

## Constraints

- No second test stack, new dependency, snapshots, or production refactoring for coverage.
- Keep original media immutable; cleanup must protect shared or admitted media.
- Test feature and page hooks in their existing layers.

## Tasks

- [x] Add upload-cleanup service tests with mocked storage and repositories; cover accepted/shared media, unsafe manifests, deletion failure, and retirement ordering.
- [x] Add focused cleanup-repository contract tests for variant/upload reference checks and locking. Preserve real database suites for SQL and transaction guarantees.
- [x] Extend media-processing and queue adapter tests for failures that must stop downstream side effects. Add taxonomy route boundary tests for prevalidation and centralized errors.
- [x] Add direct upload queue page-hook tests for concurrency, option capture, assignment retry, cancellation, and invalid files.
- [x] Add reusable mutation-editor hook/component tests for validation, pending guards, errors, focus, and confirmation.
- [x] Extend media-grid geometry tests for zero width, exact breakpoints, invalid inputs, and nonmutation.
- [x] Create `docs/architecture/TESTING.md` describing responsibilities, mocks, test inventory, and commands including opt-in integrations.
- [x] Run focused tests, full existing suites, lint, formatting, and review the diff.

## Review focus

Deletion must preserve shared media; persistence must follow successful storage removal; retries must preserve completed assignments; pending forms must suppress repeated mutations; grid inputs must produce finite bounded geometry.

## Baseline

API: 653 passing, 113 opt-in tests skipped. Web: 400 passing. Existing suites already cover routes, domain services, mocked providers/processors/queues, feature hooks, pages, upload workflows, forms, and virtualization.

## Verification

`npm test`: 13 tooling tests, 436 web tests, and 694 API tests pass; 113 external-service tests remain skipped. The tooling suite required running outside the sandbox because its existing Node subprocess tests encountered EPERM.

`npm run lint` passes. Repository-wide formatting reports the unchanged `packages/shared/package.json`; changed-file formatting and `git diff --check` pass. No production modules, test dependencies, or test-runner configuration changed.
