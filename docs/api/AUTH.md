# Local authentication

Authentication is required for every business API. Health and login are public.
The auth module owns passwords, sessions and local account provisioning; one scoped
Fastify hook protects existing routes before controllers enter services.

| Endpoint                   | Contract                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`     | JSON `{ email, password }`, header `X-Auth-Request: 1`; 200 `{ user: { id, email }, csrfToken }` and an HttpOnly session cookie. |
| `GET /api/auth/me`         | Session cookie required; 200 same user/CSRF payload.                                                                             |
| `POST /api/auth/logout`    | Session and `X-CSRF-Token` required; 204, revoke session and clear cookie; no body/query.                                        |
| Existing reads             | Session cookie required.                                                                                                         |
| Existing POST/PATCH/DELETE | Session cookie and matching `X-CSRF-Token` required, including bodyless mutations.                                               |

Unknown credential/query fields reject. Credentials require an email at most 254
characters (trimmed/lowercased), and a password of 15–128 Unicode code points and
at most 512 UTF-8 bytes. Password content is preserved. Invalid input returns 400;
invalid/expired/revoked sessions and wrong credentials return 401; invalid CSRF or
origin returns 403; throttling returns 429 with Retry-After. Centralized safe error
responses never indicate whether an email exists.

Sessions expire absolutely after eight hours by default; logging in replaces the
session cookie and revokes the previous supplied session. Tokens are 32 random
bytes and only SHA-256 token digests are persisted. Passwords use salted asynchronous
scrypt (N=131072, r=8, p=1). The cookie is host-only, HttpOnly, SameSite=Lax,
Path=/api and Secure in production. CSRF tokens are returned to authenticated callers
and stay in browser memory. Neither passwords nor session tokens are cached or logged.

| Configuration                   | Default / bounds                                                   |
| ------------------------------- | ------------------------------------------------------------------ |
| `AUTH_SESSION_LIFETIME_SECONDS` | 28800; 900–604800 seconds                                          |
| `AUTH_COOKIE_SECURE`            | true in production, false for local HTTP; production false rejects |
| `AUTH_LOGIN_RATE_LIMIT_MAX`     | 5 attempts per socket IP/minute; 1–100                             |

Use same-site browser/API hosting, preferably the existing same-origin `/api` proxy.
The exact configured FRONTEND_ORIGIN receives credentialed CORS and permission for
Content-Type, Accept, X-CSRF-Token and X-Auth-Request. No wildcard origins or arbitrary
forwarded protocol/IP headers are trusted. Login requires JSON and its custom header;
authenticated writes additionally require the session CSRF token. Cross-site cookie
hosting is not supported. Login and existing API limiters are instance-local; deployments
with multiple replicas or a proxy should supply a shared edge limiter.

## Local accounts and migration

There is no public registration or HTTP account administration. Trusted operators run:

```sh
npm run db:deploy
npm run db:generate
# Read a password without echo or command-line exposure (zsh):
read -rs 'account_password?Password: '
printf '%s' "$account_password" | npm run auth:create-user --workspace @album-manager/api -- owner@example.com
unset account_password
```

The command takes the email argument and password on stdin (at most one terminal
line ending is removed). Run it on the host with validated backend database configuration.
The first account provisions the reserved legacy owner; later commands add accounts.
Duplicate emails reject; provisioning never silently resets a password. Provisioning
uses a PostgreSQL transaction advisory lock to serialize the first-owner claim.

Migration `20261009180000_authentication` creates users/sessions, assigns all existing
favorites to a reserved account that cannot log in until provisioned, preserves IDs
and creation times, and changes uniqueness to `(userId, mediaId)`. No password is
embedded in the migration or seed. Apply migrations and provision an account before
using the protected UI; migrations are not applied on API startup.

Favorites are personal in library/search/favorites/media detail/album galleries/trash.
Media, albums, uploads, taxonomy, settings, and statistics remain shared. Every account
can modify this shared library; album PUBLIC visibility does not create anonymous access.
Previously signed storage URLs remain usable until expiry even after logout.

The browser reads `/auth/me` on mount/focus, guards the existing application shell,
and cancels/removes query caches on logout, expiry or identity change. Login has a
thin page and page hook; no business page parses credentials or checks sessions.
