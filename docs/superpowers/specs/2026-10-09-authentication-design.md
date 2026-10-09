# Authentication design

Date: 2026-10-09
Status: ready for written-spec review; implementation has not started.

## Intent and constraints

The user has deliberately authorized authentication. Add local email/password
login, persisted cookie sessions, protected API and browser routes, a current-user
endpoint, and personal favorites. Keep the existing JavaScript feature structure,
thin pages/controllers, service/repository boundaries, and public feature indexes.
All 17 documents in `docs/architecture` were read before this design.

Albums, media, uploads, taxonomy, settings, and library statistics remain shared
among authenticated users. Every provisioned account can modify the shared library,
including trash and settings. Album PUBLIC visibility does not bypass authentication.
Album/media ownership, roles, public sharing, email verification, password recovery,
and public registration are outside this change.

Implementation assumptions: trusted operators provision accounts locally; browser
and API deployment are same-site, preferably behind the existing `/api` proxy.
Production requires HTTPS. Separate same-site origins retain the exact configured
frontend-origin allowlist and use credentialed CORS. Cross-site cookie hosting is
outside this scope.

## Approach and alternatives

Use opaque, database-backed sessions. This gives immediate logout/revocation and
reuses the existing PostgreSQL lifecycle without introducing another session store.
JWT bearer tokens would require additional revocation and browser token handling.
An external identity provider would require deployment/account integration beyond
the requested local credentials. Neither alternative improves this initial scope.

## Backend boundaries

Add `apps/api/src/modules/auth` with the documented controllers, services,
repositories, validators, mappers, routes, and public `index.js`. Its services own
password verification, account provisioning, session creation/lookup/revocation,
and public user projection. Auth's route registration installs its scoped Fastify
hook; HTTP cookie handling stays at the transport boundary. Only repositories
access Prisma. Hash/session helpers stay within the auth service responsibility.

Application composition registers public health and auth login routes separately
from one protected route scope containing all existing business modules. The auth
hook validates the session and decorates requests with a trusted actor. No feature
parses cookies or verifies credentials. OPTIONS remains handled by the existing
security middleware before protected handlers.

Production composition always supplies auth; missing auth dependencies must not
expose business routes. Database-free tests can still build health-only instances.
Existing business HTTP tests inject an auth service or use explicit test fixtures;
there is no runtime environment switch that disables authentication.

## Persistence and existing favorites

Add User with UUID ID, unique normalized email, nullable password hash, and UTC
creation/update timestamps. A null hash denotes an unprovisioned account that
cannot log in. Add AuthSession with UUID ID, user foreign key, unique SHA-256 token
digest, CSRF token, creation and absolute expiry timestamps. Index session expiry
and user lookup; user deletion cascades sessions and favorites, never shared media.

Favorite gains a required userId and unique `(userId, mediaId)`. Media's singular
favorite relation becomes a plural relation. Keep media foreign-key cascade and
replace global favorite pagination indexes with user-prefixed indexes as needed.

The new migration creates one reserved, unprovisioned legacy owner account using
an explicit stable UUID and reserved invalid email, assigns every existing favorite
to that account, and only then enforces required userId and compound uniqueness.
It preserves favorite IDs and creation timestamps. No default password or usable
session is created. This account is reserved even on an empty installation so
bootstrap follows one deterministic path.

An explicit local `auth:create-user` command accepts an email argument and reads
the password from stdin, never from command arguments or logs. On first use it
atomically provisions the reserved owner; later uses create additional accounts.
Serialize owner provisioning with a repository transaction/lock. Reject duplicate
email and repeat provisioning conflicts; never silently reset another account's
password. Keep the existing data-free seed unchanged. Document migration,
client-generation, provisioning, and startup order. Do not apply production
migrations automatically or edit previous migrations.

## Passwords, sessions, and request protections

Use asynchronous Node scrypt with random salts, N=131072, r=8, p=1 and sufficient
maxmem, versioned hash encoding, and timing-safe comparison. Reject invalid hash
encodings with bounded parameters. Provision passwords of 15–128 Unicode code
points, bounded to 512 UTF-8 bytes; do not trim or normalize passwords. Email is
trimmed, lowercased, validated, and limited to 254 characters. Unknown fields reject.
Unknown/unprovisioned accounts perform dummy password verification and return the
same generic 401 as a wrong password.

Login issues a new 32-byte random opaque token and stores only its SHA-256 digest.
The browser receives it in an HttpOnly, SameSite=Lax, host-only cookie with Path=/api
and an eight-hour absolute lifetime. Secure is required in production; HTTP cookies
are allowed only in explicit local development. Bound expiry configuration to
15 minutes–7 days. Do not trust arbitrary forwarded headers to decide cookie
security. A successful login revokes the session supplied on that request before
issuing a fresh one. Logout deletes the matching session and clears the cookie.
Expired sessions are rejected by lookup and reclaimed in bounded batches during
login; session lookup never relies on cleanup having run.

Each session has an independent random CSRF token returned by login and `/auth/me`.
Protected POST/PATCH/DELETE requests require its timing-safe match in X-CSRF-Token;
logout follows the same rule. Login requires X-Auth-Request: 1, a JSON body, and
the existing exact Origin policy when Origin is present, preventing simple browser
cross-site login requests. CORS permits these two headers and credentials only
for the configured origin. SameSite supplements the CSRF boundary.

Add a bounded login limiter before expensive verification: five attempts per socket
IP per minute by default, with 429/Retry-After and no forwarded-IP trust. It
supplements existing API limits. Keep existing security headers, centralized safe
errors, no-store responses, and cookie/header redaction. Document instance-local
limiter behavior for multiple replicas.

## HTTP contract

| Route                    | Access and result                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| POST /api/auth/login     | Public; email/password JSON and X-Auth-Request; 200 `{ user: { id, email }, csrfToken }` plus session cookie. |
| GET /api/auth/me         | Valid session required; 200 same public user/CSRF shape, otherwise 401.                                       |
| POST /api/auth/logout    | Valid session and CSRF token required; 204, revoke session and clear cookie.                                  |
| GET /api/health          | Public liveness only.                                                                                         |
| Existing business routes | Valid session required; mutations also require CSRF.                                                          |

Validation returns 400, unauthenticated requests 401, invalid CSRF/origin 403,
and throttled requests 429, using existing centralized error envelopes. Mappers
never return password hashes, session digests, cookie tokens, or persistence rows.
There is no HTTP provisioning or registration endpoint.

## Personal favorites across existing features

Pass actor context explicitly through the existing media list/detail/favorite and
album-media controller/service/repository boundaries. Domain services require a
validated user UUID for user-specific reads or mutations; do not infer a user from
request bodies, arbitrary headers, globals, or missing context.

Update favorite=true to `favorites.some({ userId })` and favorite=false to
`favorites.none({ userId })`. Project at most that user's matching favorite for
media lists, media detail, and album media; keep the public boolean field unchanged.
Personal mutations create/delete only `(actorId, mediaId)` and retain existing
live-media locking/idempotency. Album gallery filters use the same actor and
existing pagination ordering. Pass context through internal public gallery service
reuse; background processing and cleanup remain identity-independent.

Dashboard contains no favorite count or flag, so its global aggregate cache remains
valid. Audit every singular favorite projection/filter and raw SQL consumer before
changing the Prisma relation. No private cross-module imports are introduced.

Trash gallery results also expose a favorite flag; pass actor context through its
list service/repository and scope that projection to the authenticated user.
Upload cleanup's eligibility check is different: a favorite belonging to any user
must continue to protect shared media from cleanup. Replace its singular relation
absence check with plural relation absence across all users; jobs need no actor.

## Frontend boundaries and lifecycle

Add `apps/web/src/features/auth` with private API adapters, query keys, reusable
hooks, AuthProvider, and RequireAuth exported through `index.js`. Add a thin login
page and page hook under `pages/auth`. Compose the provider inside QueryProvider;
it does not require router access. Compose RequireAuth around the existing
AppLayout subtree in AppRouter and add `/login` outside that guard.

The provider reads `/auth/me`, shows loading/retry on transport failures, treats
401 as signed out, and exposes login/logout/current user. The guard redirects
signed-out users to login and retains only a validated local return path. No
business page gains authentication checks or credential handling. Add account and
logout UI through application layout composition, supplying callbacks to generic
layout components.

The generic HTTP client gains injected request-context and unauthorized-response
callbacks; shared transport must not import auth. AuthProvider installs callbacks
for in-memory CSRF headers and session-expiry handling. All API requests include
credentials; direct presigned storage transport is unchanged. HTTP failure remains
normalized and requests are never automatically replayed.

On logout, session expiry, or identity change, cancel pending queries, unmount the
protected subtree, and remove cached business data before exposing another user's
session. Fence in-flight auth responses so an old response cannot restore a logged
out identity. Refresh `/auth/me` on browser focus to catch external revocation.
Keep CSRF/session state in memory only. Preserve login drafts on failure, disable
pending submissions, and provide accessible labels and generic error feedback.

## Validation and completion criteria

Colocated Vitest tests cover real hashing/verification, validation, generic login
failures, token digests, expiry/revocation, bounded throttling and CSRF. Real Fastify
inject tests prove every business route is protected, public health/login and
preflight work, cookies/CORS/errors are correct, and supplied identity is ignored.

PostgreSQL integration tests use isolated schemas to prove migration preservation,
compound favorite uniqueness, owner-provisioning races, and two-user isolation
across mutations, media filters/detail, and album galleries. Retain existing media
locking, pagination, deletion, and worker tests.

Frontend composition tests retain real router/query/auth providers and fake network
transport. Verify initial auth loading, login/return navigation, logout/expiry,
failed requests, CSRF/credentials, cached-data removal, and account-switch races.
Update existing app tests to exercise authenticated fixtures and unauthenticated
redirects. Run full tests, lint, format check, web build, Prisma validation and
generation, architecture guard, and available isolated integrations. Report skipped
integrations separately. Update API, schema, security, structure, README and developer
docs to replace the superseded single-user trust model.

## Security references

Password work factors follow [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Cookie/session controls follow [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Custom headers and session CSRF checks follow [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
