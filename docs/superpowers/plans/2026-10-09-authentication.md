# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** Add local authentication and personal favorites without reorganizing existing features.

**Architecture:** An auth module owns credentials, persistent sessions, provisioning, and a scoped Fastify authentication/CSRF hook. A frontend auth feature provides session state and one route guard. Existing favorite consumers receive explicit actor context through their current layers; all other library data remains shared.

**Tech Stack:** JavaScript ES modules, Node crypto, Fastify 5, Prisma/PostgreSQL, React, React Router, TanStack Query, Vitest, existing ESLint/Prettier and architecture checks. Use `@fastify/cookie` compatible with Fastify 5 for cookie parsing/serialization.

**Spec:** `docs/superpowers/specs/2026-10-09-authentication-design.md`

## Global Constraints

- JavaScript only; preserve thin pages/controllers, repository persistence, feature public indexes, and generic shared layers.
- Every account can modify the shared library. Albums, media, uploads, taxonomy, settings, and statistics remain shared.
- No public registration, ownership migration for albums/media, password recovery, or role system.
- Password provisioning: 15–128 Unicode code points and at most 512 UTF-8 bytes; email at most 254 characters, trimmed/lowercased. Passwords are never trimmed/normalized.
- Asynchronous scrypt: N=131072, r=8, p=1, random salt, versioned bounded encoding, timing-safe verification, explicit adequate maxmem.
- Session token: 32 random bytes, SHA-256 digest only in persistence; default eight-hour absolute expiry, configured bounds 15 minutes–7 days.
- Host-only HttpOnly cookie, Path=/api, SameSite=Lax; Secure in production, insecure only in local development.
- Session CSRF token on protected mutations; X-Auth-Request: 1 and JSON required for login; exact frontend Origin/CORS policy.
- Login limiter defaults to five attempts per socket IP per minute, bounded entries, 429/Retry-After.
- Migrations preserve favorite IDs/timestamps and do not run on application startup. Seed remains data-free.
- Use existing test stacks and isolated integration resources. Do not create an auth-disable environment setting.
- Do not commit or mutate repository metadata during this workspace implementation; `.git` is read-only under the current permission profile. Leave reviewable working-tree changes.

## Review Focus

- First account provisioning races: only one caller claims the legacy owner, preserving all previous favorites.
- Relation cardinality changes: trash flags stay personal and upload cleanup remains blocked by any user's favorite.
- Auth state races: pending `/auth/me` or query responses cannot restore identity or data after logout/account change.
- Cross-origin login and mutation requests: JSON/custom headers and exact CORS enforce the intended boundary, including bodyless mutations.
- Missing dependencies or invalid cookies: business routes never become public and malformed cookie/token input never reaches credential/session persistence.

## Task 1: Credential and session domain

**Create:**
`apps/api/src/config/auth.js`, `auth.test.js`;
`apps/api/src/modules/auth/services/password.service.js`, `password.service.test.js`,
`auth.service.js`, `auth.service.test.js`, `auth.errors.js`;
`apps/api/src/modules/auth/validators/auth.validator.js`, `auth.validator.test.js`;
`apps/api/src/modules/auth/mappers/auth.mapper.js`.

**Interfaces:**
`validateAuthEnvironment(environment)` returns immutable `{ cookieName, cookieSecure, sessionLifetimeSeconds, loginRateLimitMax, loginRateLimitWindowMs }`.
`hashPassword(password)` returns the versioned hash string;
`verifyPassword(password, encodedHash)` resolves boolean.
`createAuthService({ repository, config, clock })` exposes
`login({ email, password }, previousToken) -> { user, csrfToken, token, expiresAt }`,
`authenticate(token) -> { user, csrfToken, sessionId }`,
`logout(token) -> void`, `provision({ email, password }) -> { id, email }`.
The repository contract is defined in Task 2; clocks return a Date.

- [ ] Write password/config/validator tests: salted hashes differ; correct password verifies; wrong/malformed/oversized encoded hashes reject; spaces and Unicode passwords retain exact values; production cannot disable Secure; expiry outside 900–604800 seconds rejects; defaults are 28800 seconds and 5/60000 login limits; unknown credential fields reject.
- [ ] Run `npm test --workspace @album-manager/api -- src/config/auth.test.js src/modules/auth/validators/auth.validator.test.js src/modules/auth/services/password.service.test.js`; confirm failures are missing implementations.
- [ ] Implement validated configuration, strict credentials, explicit public mappers, and asynchronous bounded scrypt with timing-safe comparison and no supplied input in errors.
- [ ] Write auth service tests with injected repository/clock: unknown or null-hash account performs dummy verification and generic 401; login stores digest rather than token; fresh login revokes the supplied valid session; exact expiry rejects; logout revokes; provisioning never logs or returns hashes.
- [ ] Implement the service using Task 2's contract, independent random session and CSRF tokens, bounded expired-session cleanup, and injected time. Public transport strips token/sessionId; authentication retains trusted context.
- [ ] Run `npm test --workspace @album-manager/api -- src/config/auth.test.js src/modules/auth`; all new domain tests pass with real hash verification in dedicated hash tests.

## Task 2: Schema, auth persistence, and local provisioning

**Create:**
`apps/api/prisma/migrations/20261009180000_authentication/migration.sql`;
`apps/api/src/modules/auth/repositories/auth.repository.js`, `auth.repository.test.js`, `auth.integration.test.js`;
`apps/api/src/modules/auth/commands/createUser.js`, `createUser.test.js`;
`apps/api/src/modules/auth/index.js`.

**Modify:** `apps/api/prisma/schema.prisma`, `apps/api/package.json`,
`apps/api/src/infrastructure/database/schema.test.js`.

**Interfaces:**
`createAuthRepository(client)` exposes `findUserByEmail(email)`,
`createSession({ userId, tokenHash, csrfToken, createdAt, expiresAt })`,
`findSession(tokenHash, now)` with explicit safe user selection,
`deleteSession(tokenHash)`, `deleteExpiredSessions(now, limit)`,
`provisionUser({ email, passwordHash })` with transactional owner-claim semantics.
`createAuthModule({ client, config, clock }) -> { service }` composes Task 1.
`auth:create-user` takes email as a positional argument and password on stdin.

- [ ] Write repository tests pinning tokenHash/userId/expiry predicates, bounded cleanup, explicit selections, and transaction-client use. Write CLI tests asserting stdin-only password input, sanitized failure output, and database cleanup after success/failure.
- [ ] Run `npm test --workspace @album-manager/api -- src/modules/auth/repositories/auth.repository.test.js src/modules/auth/commands/createUser.test.js`; confirm missing-module failures.
- [ ] Add User/AuthSession and plural Media.favorites; make Favorite.userId required with unique `(userId, mediaId)`, explicit foreign-key actions, and appropriate user/expiry indexes. Write a forward SQL migration with stable legacy-owner UUID, reserved invalid email/null hash, complete favorite backfill, and removal of global favorite uniqueness after backfill.
- [ ] Implement persistence and local provisioning with a transaction row lock on the reserved owner; hash before acquiring the lock. CLI uses the existing validated database owner, consumes stdin without echoing/logging passwords, and closes in finally. Add the workspace command and public exports.
- [ ] Run `npm run db:generate` and Prisma validation with `npx prisma validate --config apps/api/prisma.config.js`; both succeed without applying migrations to application data.
- [ ] Write isolated PostgreSQL tests: migrate an existing favorite fixture preserving ID/time; two users favorite the same media; duplicate same-user favorite rejects; null-hash owner cannot authenticate; concurrent owner claims serialize and do not reset credentials; session revocation/expiry persists.
- [ ] Run `DATABASE_TESTS=1 npm test --workspace @album-manager/api -- src/modules/auth/repositories/auth.integration.test.js src/infrastructure/database/schema.test.js` against local test services; record skips or unavailable services explicitly.

## Task 3: Auth HTTP boundary and protected composition

**Create:**
`apps/api/src/modules/auth/controllers/auth.controller.js`;
`apps/api/src/modules/auth/routes/auth.routes.js`, `auth.plugin.js`, `auth.routes.test.js`;
`apps/api/src/modules/auth/services/loginLimiter.service.js`, `loginLimiter.service.test.js`;
`apps/api/src/app/authProtection.test.js`;
`apps/api/src/shared/middleware/auth.testUtils.js` (test-only helper).

**Modify:** auth `index.js`, `apps/api/src/app/app.js`, `registerPlugins.js`,
`server.js`, `apps/api/src/shared/middleware/security.plugin.js`, API manifest/lockfile,
and existing app/route tests that compose business handlers without auth fixtures.

**Interfaces:**
`authRoutes(app, { service, config })` registers login/me/logout.
`authProtection(app, { service, config })` installs the session/CSRF onRequest hook
and declares trusted `request.actor = { id, email }`.
`buildApp({ authService, authConfig, ...existingOptions })` composes injected auth
or database-backed auth and rejects business-service composition without auth.

- [ ] Write Fastify inject tests for public health/login/preflight; missing/invalid/expired session 401; CSRF missing/mismatch 403 on POST/PATCH/DELETE, including logout; generic wrong-password 401; safe envelopes; exact-origin credentialed CORS; no public access when auth dependencies are absent.
- [ ] Run `npm test --workspace @album-manager/api -- src/modules/auth/routes/auth.routes.test.js src/app/authProtection.test.js`; confirm expected failures before route wiring.
- [ ] Add the Fastify-compatible cookie package, strict auth route schemas and thin controllers. Implement cookie issue/clear with matching attributes and explicit config. Keep session values out of JSON/logs.
- [ ] Implement bounded pre-hash login throttling and tests for exhausted quota, window reset, capacity failure, shutdown cleanup, and ignored forwarded IP. Install auth once around all existing business routes; keep health/login public and auth-required me/logout explicit.
- [ ] Update generic security CORS to allow credentials and X-CSRF-Token/X-Auth-Request only for exact allowed origins; retain no-store, origin validation, JSON-only and existing rate limits. Login requires X-Auth-Request: 1. Reject malformed/duplicate auth cookies safely.
- [ ] Supply a reusable injected actor/session fixture in existing HTTP tests; production code must not import test helpers. Authentication tests retain real service and hooks where behavior depends on them.
- [ ] Run `npm test --workspace @album-manager/api -- src/modules/auth src/app src/shared/middleware`; all auth/protection and existing security tests pass. Enumerate registered business routes in the protection regression so newly composed modules inherit the guard.

## Task 4: Personal favorite reads and writes

**Modify:** media controllers/services/repositories for list, detail, favorite,
and trash; `mediaList.query.js`, `mediaList.mapper.js`, `mediaDetail.mapper.js`,
`mediaUploadCleanup.repository.js`; albums `album.controller.js`,
`albumMedia.service.js`, `albumMedia.repository.js`; existing related colocated
service/repository/route/integration tests and `album.testUtils.js`.

**Create:** `apps/api/src/shared/validation/actor.js`, `actor.test.js`;
`apps/api/src/modules/media/repositories/personalFavorites.integration.test.js`.

**Interfaces:**
`requireActorId(actor)` returns validated UUID or throws a safe error.
`mediaListService.list(input, actor)`, `mediaDetailService.detail(id, query, actor)`,
`mediaFavoriteService.add/remove(id, query, body, actor)`,
`albumService.listMedia(id, input, actor)`, and `mediaTrashService.list(input, actor)`
pass validated userId to their repositories. Other methods keep existing signatures.
Repository list/detail methods append userId as the final argument; projections use
`favorites: { where: { userId }, take: 1, select: { id: true } }`.

- [ ] Write repository/service tests pinning favorite=true to some(userId), favorite=false to none(userId), mutations to `(userId, mediaId)`, no persistence on invalid actor, personal detail/gallery/trash flags, and any-user favorite protection during upload cleanup.
- [ ] Run the focused affected suites before implementation; confirm failures represent the old global relationship behavior.
- [ ] Pass `request.actor` in the five relevant controllers. Validate actor in services, append userId through transaction/public-service boundaries, update plural relation selectors and mappers to `favorites.length > 0`, and preserve public boolean payloads/pagination/locking/idempotency.
- [ ] Change upload cleanup's absence condition to `favorites: { none: {} }`; workers and cleanup remain actor-free. Search runtime code for every former singular Prisma favorite relation and update test fixtures to the generated schema.
- [ ] Add two-user isolated integration tests across list positive/negative filters, detail, album-media filters, trash projection, idempotent add/remove, and deletion/pagination ties; removing A's favorite must preserve B's favorite and its timestamp.
- [ ] Run `npm test --workspace @album-manager/api`; existing domain/HTTP tests and new personal favorite tests pass. Run `DATABASE_TESTS=1 npm test --workspace @album-manager/api` against isolated local database resources and distinguish other skipped integrations.

## Task 5: Frontend session feature and protected routes

**Create:**
`apps/web/src/features/auth/index.js`, `api/authApi.js`, `api/authQueryKeys.js`,
`hooks/useAuth.js`, `providers/AuthProvider.jsx`, `components/RequireAuth.jsx`,
`providers/AuthProvider.test.jsx`, `components/RequireAuth.test.jsx`;
`apps/web/src/pages/auth/LoginPage.jsx`, `hooks/useLoginPage.js`,
`LoginPage.module.css`, `LoginPage.test.jsx`.

**Modify:** `apps/web/src/services/httpClient.js`, `httpClient.test.js`,
`app/providers/AppProviders.jsx`, `app/router/AppRouter.jsx`,
`app/layouts/AppLayout.jsx`, `app/layouts/AppLayout.module.css`, `app/App.test.jsx`.

**Interfaces:**
HTTP client `configureRequestContext({ getHeaders, onUnauthorized }) -> cleanup`
installs generic callbacks without importing auth; cleanup removes only its own registration.
API requests include `credentials: 'include'`; callbacks receive enough response
context to ignore login's ordinary 401 and stale requests from an earlier identity.
Auth feature exports `AuthProvider`, `RequireAuth`, `useAuth()` returning
`{ user, status, error, login, logout, retry }`. Auth API exposes login/me/logout;
credentials and CSRF are memory-only.

- [ ] Write transport/provider/guard tests for credential inclusion, CSRF on bodyless writes, callback cleanup, initial loading, 401 vs network failure, expiry, pending me vs logout, pending business responses vs account change, and browser focus refresh.
- [ ] Run `npm test --workspace @album-manager/web -- src/services/httpClient.test.js src/features/auth`; confirm new behavior fails before implementation.
- [ ] Implement generic transport callback injection and provider lifecycle with generation-fenced auth responses. On logout/expiry/identity change, cancel queries, unmount protected content, clear business cache, and expose the next identity only after cleanup. Avoid automatic mutation replay and leave signed storage PUTs unchanged.
- [ ] Compose AuthProvider under QueryProvider without router dependencies; put RequireAuth around existing AppLayout routes and login outside. Guard allows only local return paths, preserves protected URLs, shows retry on network failure, and redirects only known signed-out state.
- [ ] Write real-form login tests for valid submission, generic errors, pending controls, preserved draft, safe return path, and no stored secrets. Implement thin LoginPage with page hook consuming public auth exports and accessible controls. Compose account/logout UI in AppLayout with generic presentation receiving callbacks.
- [ ] Update app routing tests with real provider/network fixtures for signed-in and signed-out states. Run `npm test --workspace @album-manager/web`; existing feature/page tests and auth composition pass.

## Task 6: Documentation and full verification

**Create:** `docs/api/AUTH.md`, `apps/web/src/features/auth/README.md`.

**Modify:** `README.md`, `docs/DEVELOPMENT.md`, `.env.example`,
`docs/database/SCHEMA.md`, `DATABASE_RULES.md`, `docs/api/MEDIA_FAVORITES.md`,
`MEDIA.md`, `MEDIA_DETAIL.md`, `TRASH.md`, `ALBUMS.md`,
`docs/architecture/SECURITY.md`, `ARCHITECTURE_RULES.md`,
`BACKEND_STRUCTURE.md`, `FRONTEND_STRUCTURE.md`, `TESTING.md`.
Preserve dated audit reports as historical records; link current auth docs where needed.

- [ ] Document exact API/errors/configuration, account CLI stdin usage, migration/generation/provisioning/startup order, legacy owner behavior, shared-library permissions, production HTTPS/same-site cookies, session expiry/logout, instance-local limiter, and temporary signed URL behavior after logout.
- [ ] Update superseded single-user/global-favorite rules consistently. Keep architecture examples aligned with public indexes, scoped hook/provider composition, and no auth in workers.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, `npm run build --workspace @album-manager/web`, `npm run db:generate`, Prisma validation, and `git diff --check`. Expected: exit 0; default external-service skips are reported separately.
- [ ] Run available local `DATABASE_TESTS=1` API integration checks; existing Redis/S3 checks only when configured test services are available. Do not claim mocked/default tests prove external persistence/provider behavior.
- [ ] Review final diff against the spec: no missing route guard, credential leaks, global favorite reads, stale identity/cache races, implicit ownership, forbidden imports, or auth bypass switch. Correct confirmed issues and rerun affected checks.
- [ ] Deliver the implemented changes with concise verification evidence, skipped integrations, and concrete local setup commands. Do not apply production migrations, publish, or commit.

## Plan review

Self-review checked spec coverage, signature agreement, relation consumers, provisioning
and frontend races, CSRF/CORS, and verification boundaries. Tasks 1–2 establish the
domain/persistence interfaces, Task 3 enforces HTTP protection, Task 4 scopes favorite
consumers, Task 5 composes browser auth, and Task 6 documents/verifies the whole change.
Native execution is recommended because these tasks share interfaces and schema
changes; no subagents are needed unless the user selects delegation.

Status: waiting for written-plan review and execution selection.
