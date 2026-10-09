# Testing responsibilities and boundaries

Read this with [Architecture rules](ARCHITECTURE_RULES.md),
[Backend structure](BACKEND_STRUCTURE.md), and
[Frontend structure](FRONTEND_STRUCTURE.md).

## Existing infrastructure

Keep the foundation test stacks. Both applications use **Vitest** with explicit
imports of test helpers. The API uses the Node environment in
`apps/api/vitest.config.js`; the web uses jsdom and React Testing Library in
`apps/web/vite.config.js`, with DOM matchers and automatic cleanup in
`apps/web/src/test/setup.js`. Use the existing `user-event` dependency for browser
interactions, especially native form validation and disabled controls.

Root infrastructure scripts use Node's built-in test runner. This is the existing
tooling suite, not an alternative application test framework. Do not add Jest,
another DOM runner, or a parallel test directory/configuration.

Colocate `*.test.js` / `*.test.jsx` with the responsibility under test. Keep
database/provider integration suites in their existing `*.integration.test.js`
locations. Shared frontend test support belongs in `src/test`; backend database
tests reuse `infrastructure/database/isolatedDatabase.testUtils.js` where suitable.
Do not duplicate production logic in fixtures.

## Unit test responsibilities

| Layer                             | Responsibility                                                                                                             | Replace at its boundary                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Backend services/domain functions | Invariants, validation, transitions, eligibility, idempotency, retry behavior, and coordination                            | Inject repositories, storage providers, image processors, queue producers, and clocks as needed                |
| Backend repositories              | Query contracts, live-row filters, relation restrictions, reference checks, parameter binding, and propagation of failures | Fake the Prisma client for focused contract tests; use PostgreSQL integration tests for database semantics     |
| Storage/queue/image adapters      | Translate abstraction contracts to vendor calls, manage resources, and handle failures                                     | Inject SDK clients, Redis/queue factories, or processor dependencies supported by the adapter                  |
| Generic hooks                     | State transitions, cleanup, pending guards, persistence, and cancellation                                                  | Mock browser APIs only when jsdom cannot provide their behavior                                                |
| Feature hooks                     | Query keys, enabled state, cursor forwarding, cache updates/invalidation, cancellation, and errors                         | Mock fetch/transport responses; retain real React and TanStack Query                                           |
| Page hooks                        | Page state, URL/filter orchestration, selection, scheduling, and cross-feature actions                                     | Use real feature hooks with fake transport, or replace public feature actions for a focused orchestration test |
| Reusable components/forms         | Accessible labels, focus, loading/error/empty states, valid submission, cancellation, and pending controls                 | Supply callbacks or editor state; retain actual DOM controls                                                   |
| Pure media-grid utilities         | Breakpoints, card dimensions, bounded row slices, empty/partial rows, invalid geometry, and preserved item references      | Nothing                                                                                                        |

Test observable results and consequential side effects. Negative assertions are
valuable at safety boundaries: invalid input must not reach persistence, a failed
processor must not publish READY or derivatives, and a shared original must not
be deleted. Avoid asserting every incidental collaborator call or private helper.

Frontend upload tests cover local validation, bounded concurrent lifecycles,
captured options, final media IDs, duplicate decisions, cancellation, and retries.
Assignment retries must preserve their original options and completed steps;
they must not retransfer an already uploaded file. Direct queue-hook tests isolate
scheduling while `UploadPage.test.jsx` exercises real feature hooks and transport
through the page, including cross-domain assignments.

## Integration test responsibilities

- **HTTP:** Build the real Fastify application and use `app.inject`. Exercise
  registration, request validation, controllers, status codes, serialization,
  centralized error envelopes, request IDs, and cache headers. Domain services
  can be injected to isolate transport behavior. Keep real services in tests
  that verify domain validation and coordination through HTTP. An injected
  service test does not prove service validation or database correctness.
- **Database:** Use real Prisma, reviewed migrations, and PostgreSQL to verify
  constraints, transactions/rollback, row locking, race handling, soft deletion,
  relationships, and pagination with equal sort values and stable ID tie-breakers.
  Fake query-shape tests cannot establish any of these guarantees.
- **Storage and queue:** Existing opt-in tests verify S3-compatible provider
  operations/presigned requests and Redis/BullMQ acceptance, stable job identity,
  worker execution, and retries. Mocked SDK tests do not prove wire compatibility
  or Redis delivery behavior.
- **Image processing:** Retain real Sharp tests using small generated image
  buffers to verify decoding, orientation, output format, dimensions, quality
  policy, placeholders, and immutable source bytes. Mocked processors verify
  orchestration, not encoded output correctness.
- **Frontend composition:** Mount pages/providers with a fresh query client and
  router where needed. Keep their page hooks, feature hooks, API modules, and
  HTTP normalization real; fake transport at the network boundary. Assert user
  interactions and resulting requests/cache/UI behavior. jsdom does not prove
  browser layout or physical scrolling; grid calculations and virtualization
  tests establish their narrower contracts.

Some existing suites combine domain and HTTP coverage in one file, such as
`taxonomy.service.test.js` and `mediaTrash.service.test.js`. Review their contents
before treating the absence of a separately named route test as a coverage gap.

## What should be mocked

- Storage provider calls in business-service/job tests; test missing objects,
  failures, retries, recorded deletion manifests, and original immutability.
- Image processor methods in processing-service tests, including early failures
  that must stop downstream persistence/storage writes.
- Queue producers and worker factories in upload/job orchestration tests. Upload
  HTTP tests wait for job acceptance, never image transformation completion.
- Repositories in service tests and SDK clients in adapter tests. Keep mocks
  faithful to the documented public abstraction, including asynchronous failures.
- Fetch/XHR in frontend tests; preserve AbortSignal behavior when testing
  cancellation. Use the existing transport test doubles for presigned uploads.
- Time, observers, media queries, and element measurements when needed for
  deterministic expiry, debounce, and virtualization behavior.

Use controlled promises to exercise in-flight work instead of sleeps. Fake timers
are appropriate for debounce, expiry, polling, and cache retention; restore them
after each test. Restore global mocks and clear/unmount query clients so tests do
not share state. Close Fastify instances, database clients, and workers even after
failed assertions.

## What should not be mocked

- The function, hook, component, service, or adapter whose behavior the test claims
  to cover. Do not recreate its algorithm in expected-value helpers.
- Validators, mappers, and error handling in HTTP/domain integration tests.
- Fastify route registration, serialization, or `inject` in HTTP tests.
- React, native form controls, and TanStack Query in hook/cache/page integration
  tests. Use actual providers with isolated clients.
- Prisma/PostgreSQL in tests claiming database guarantees; S3/Redis in tests
  claiming provider/queue integration; Sharp in tests claiming image correctness.
- Architecture boundaries: pages consume feature public indexes; services use
  repository/provider abstractions; shared layers remain domain independent.
  Production modules must not import test helpers. Test mocks do not authorize
  forbidden production imports or bypass those boundaries.

Prefer semantic assertions over snapshots: roles/labels, state transitions,
specific response fields, bounded rendered items, and side effects. Do not snapshot
whole pages, response bodies, generated URLs, or implementation-specific markup.
Do not use numerical coverage alone as evidence that a behavior is tested.

## Running tests

Run from the repository root with the existing dependencies installed:

```sh
npm test
npm test --workspace @album-manager/api
npm test --workspace @album-manager/web
npm test --workspace @album-manager/web -- src/pages/upload/hooks/useUploadQueue.test.jsx
npm run lint
npm run format:check
```

The default suite skips external-service integration tests. With the local test
services available and backend environment configured, run:

```sh
DATABASE_TESTS=1 npm test --workspace @album-manager/api
STORAGE_TESTS=1 npm run test:storage --workspace @album-manager/api
QUEUE_TESTS=1 npm test --workspace @album-manager/api -- src/infrastructure/queue/queue.integration.test.js
```

`test:database` currently runs the schema suite only; use `DATABASE_TESTS=1` with
the full API test command to include all repository integration suites.
Database suites use generated isolated schemas and fixture rollback where
appropriate; storage uses a generated test bucket; queues use generated prefixes.
Use local test services and never point these suites at production resources.
See [Local infrastructure](../../README.md#local-development-infrastructure) for environment setup.

Report skipped integrations separately from passing tests. A green default suite
does not establish database, storage, or queue integration compatibility.
