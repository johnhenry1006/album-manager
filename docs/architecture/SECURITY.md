# Security boundaries and review

Updated 2026-10-09 after local authentication was deliberately introduced. JavaScript,
feature/provider boundaries and controller/service/repository layering are preserved.

## Trust and deployment scope

All business APIs require a valid persisted session. Health and login are public.
One scoped Fastify auth hook owns cookie validation, trusted actor context and CSRF
checks; auth services/repositories own credentials and persisted sessions. See
[Auth API](../api/AUTH.md) for contracts, account provisioning and migration order.

Favorites are user-scoped. All authenticated accounts can read and modify the shared
library, including settings/trash. Albums/media have no owner or role restrictions;
PUBLIC album visibility does not bypass authentication. Operators provision accounts
locally, with no public registration. Existing favorites survive under the first
provisioned owner account. No default login credential is created.

Use HTTPS in production and same-site browser/API deployment. Session cookies are
HttpOnly, host-only, SameSite=Lax, Path=/api, and Secure in production. Absolute
expiry is eight hours by default; login rotates the token and logout revokes it.
Only token digests are persisted, and passwords use salted asynchronous scrypt.
CSRF tokens stay in memory and are required on authenticated mutations. Login's
JSON/custom-header boundary and exact origin allowlist prevent simple browser
cross-site login requests. Database-free composition cannot expose business routes
without an injected auth service. Background jobs retain validated service entry points.

Keep database, Redis and storage administration on trusted networks. CORS, UUIDs,
confirmations and rate limits remain separate from authentication. Instance-local
login limits supplement existing API limits; proxy/replica limits belong at the edge.
Previously signed storage URLs remain valid until expiry after logout.

## Request validation

- Fastify JSON schemas reject unknown properties and wrong types instead of
  silently removing properties or coercing JSON values. Upload pagination converts
  validated scalar query text explicitly; repeated query values reject.
- Feature validators enforce UUIDs, allowed fields, bounded pagination, search,
  cursor ordering, metadata, assignments, settings and mutation invariants before
  persistence. Controllers remain thin and domain services recheck their inputs.
- Previously ignored query parameters on upload, album detail and album/taxonomy
  mutations now reject. Bodyless deletion endpoints reject bodies. GET/HEAD bodies
  reject; health rejects query parameters.
- The HTTP boundary accepts JSON content types only. JSON bodies are limited to
  64 KiB; upload metadata routes use 16 KiB. Request receipt has a 30-second timeout.
  Binary uploads go directly to storage, never through a JSON handler.
- Configuration and queue payloads retain their dedicated validators. SQL uses
  Prisma builders or parameterized/tagged queries, never interpolated client SQL.

Fastify's validation defaults include coercion and removal of additional fields;
this application deliberately disables both. See the
[Fastify validation reference](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/).

## Upload type, name and size protections

Registration allows only the configured subset of `MEDIA_FORMATS`. Filenames use
NFKC normalization, at most 255 UTF-8 bytes, a restricted display character set,
and a matching extension (`jpg`/`jpeg` for JPEG). Paths, controls, leading dots,
trailing spaces/dots and Windows device names reject. Display filenames never
select storage directories.

`UPLOAD_MAX_FILE_SIZE_BYTES` defaults to 100 MiB and accepts 1 byte through 5 GiB.
`UPLOAD_MAX_FILES_PER_SESSION` defaults to 1000. These are per-file/session limits,
not a total library quota. Use limits compatible with worker memory: originals
are currently buffered for hashing and image decoding.

Presigned PUTs sign both MIME and exact registered Content-Length. Browser code
sends the File/Blob and the returned content-type; the browser sets Content-Length
itself. Do not attempt to set that forbidden browser header in JavaScript.
Completion checks storage HEAD size, MIME and ETag against registration, then
copies the ETag-matched staging object into a unique immutable original key.
The staging key must match the file's persisted session/file UUIDs exactly.

Declared MIME and extensions do not prove file contents. The dedicated worker
uses Sharp inspection and compares decoded MIME/format with the registered image
before metadata extraction, rendition generation and READY publication. Invalid,
unsupported, mismatched (including HEIC presented as AVIF), multi-page/animated or over-100-million-pixel images fail
with sanitized errors; originals stay immutable. Video metadata registration is
supported by the existing contract, but video decoding/processing is not implemented
and fails explicitly. No video content verification or malware scanner is claimed.

Original GET URLs force Content-Disposition attachment so retained or failed
originals are downloaded rather than rendered as documents on the storage origin.
Use a separate storage origin, private buckets and no anonymous object access.

## Object keys and presigned access

Storage access stays behind the injected provider. HTTP callers identify media
or upload files with UUIDs; there is no client-key read, sign, copy, delete, prefix
listing or filesystem endpoint. Services resolve keys from recorded rows.

Provider validation rejects absolute keys, empty/dot/dot-dot segments, backslashes,
controls, colons, percent encoding and keys over 1024 bytes. Rejecting percent
encoding prevents decoding/proxy ambiguities such as `%2e%2e`, `%2f`, `%5c` or
nested escapes. S3 keys are opaque object identifiers, not filesystem paths:
never concatenate them into filesystem paths or recursively delete a client prefix.

Server-generated keys use UTC partitions, UUIDs and sanitized bounded basenames.
Permanent purges additionally require the documented
`media/YYYY/MM/DD/{selectedMediaId}/{variantDirectory}/{safeFilename}` namespace
for every recorded key. Keys outside this namespace, including historical/imported
noncanonical keys, fail closed and require deliberate reconciliation before purge.
No storage object is deleted before the complete manifest validates.

Upload, gallery, display and original signing default to 900 seconds. API
configuration restricts each to 1–3600 seconds; clients cannot choose expiry.
The generic provider retains its existing 1–604800-second integration contract.
Presign responses explicitly project public fields. Access-key identifiers in
SigV4 URLs are expected; secret signing keys never enter responses or browser code.

Presigned URLs are temporary bearer capabilities. Anyone holding one can use it
until expiry; they are reusable, not one-time tokens. A PUT may be reused to
replace its staging object during that window, but cannot overwrite the copied
original. Application status changes do not revoke previously signed GET URLs;
deleted objects stop serving, while soft-deleted media may remain accessible via
an earlier unexpired URL. Do not log, persist, share or permanently cache signatures.
See [Amazon S3 presigned URL behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

## HTTP protections

`FRONTEND_ORIGIN` is one exact allowed browser origin, e.g.
`https://album.example`. Empty/unset allows no Origin-bearing request. Configure
the frontend origin even when browser mutations use a same-origin `/api` proxy.
Lists, wildcards, `null`, credentials, paths, fragments and queries reject at startup;
the value must match a canonical URL origin without a trailing slash. This matches
the local storage proxy's single-origin contract.

Origin-bearing requests from unlisted origins return 403 before business handlers.
The allowlist does not rely on a caller-controlled Host header. Valid preflight
allows GET/HEAD/POST/PATCH/DELETE/OPTIONS and Content-Type/Accept/X-CSRF-Token/X-Auth-Request, with credentialed CORS for the
exact configured frontend origin. Non-browser clients can omit or forge Origin; CORS is not access
control. Storage browser CORS is configured independently in infrastructure with
its exact frontend origin and PUT/GET/HEAD permissions.

All API responses, including errors, have nosniff, frame denial, no-referrer,
a restrictive API CSP (`default-src 'none'`), disabled camera/microphone/geolocation
permissions and `Cache-Control: no-store`. HSTS is set on actual HTTPS requests.
TLS termination must set HSTS and appropriate headers at the edge as well; the API
does not trust arbitrary forwarded-protocol headers. The frontend host needs its
own HTML CSP allowing the deployed API and storage origins, and its own frame,
nosniff and referrer headers. The API's deny-all CSP is for JSON responses only.

| Configuration              | Default | Bounds / behavior                       |
| -------------------------- | ------- | --------------------------------------- |
| `API_RATE_LIMIT_MAX`       | 600     | 1–100000 requests per socket IP/window  |
| `API_WRITE_RATE_LIMIT_MAX` | 120     | 1–100000 mutations per socket IP/window |
| `API_RATE_LIMIT_WINDOW_MS` | 60000   | 1–3600000 milliseconds                  |

The shared middleware counts reads, signing, preflights, errors and writes; writes
also consume their smaller quota. Excess requests return 429 and Retry-After.
Counters are fixed-window, instance-local and bounded to 10000 IP entries; expired
entries are reclaimed and new IPs fail closed at capacity. Closing the application
clears counters. Forwarded IP headers are not trusted. An edge/shared limiter is
needed across replicas and behind proxies; socket-based limits may group clients
behind one proxy/NAT. This does not prevent distributed attacks or enforce storage
quotas. Rate limits apply to the API; signed storage requests bypass it and need
provider/edge capacity policies. S3-compatible deployments must verify that signed
Content-Length, ETag conditions and response disposition overrides are enforced.

## Errors, secrets and frontend

Centralized responses contain a safe status, generic message, error code and
request ID, never stacks, raw database/vendor messages or rejected input. HTTP
failure logs retain request ID/status rather than raw exception content. Default
request logging excludes query strings and bodies, and redacts authorization,
cookies and Set-Cookie. Startup failures print a fixed message. Custom injected
loggers and reverse proxies must preserve equivalent redaction.

Backend storage/database/Redis credentials remain server-only in configuration;
shared/browser code contains no credentials. API mappers project explicit output
fields. Only public values belong in VITE configuration. Deployment secrets and
local credential files must stay ignored and outside build artifacts.

Frontend rendering uses React text nodes; no unsafe HTML rendering, HTML injection
or eval was found. Metadata JSON is rendered as text. Original links validate
HTTP(S) URLs and use noopener/noreferrer. The JSON client rejects absolute URLs,
path traversal, malformed/nested encoding and backslashes before fetch; safely
encoded path IDs remain supported. API and storage failures use normalized
ApiError messages; raw HTML responses and network details are not displayed.

The generic `useLocalStorage` helper has no production consumers. No secrets or
signed URLs are persisted, and Query/Zustand state is not persisted. File objects,
signed URLs and API data stay in memory. Do not introduce persistence of secrets
or signed capabilities when adding caching or authentication.

Moving media to trash and removing album memberships require confirmation.
Category/tag deletion and permanent media deletion retain their existing explicit
confirmation workflows. Permanent trash confirmation captures selected IDs and
sends `{ confirm: true }`; cancelling performs no mutation. Hooks stay reusable,
while page orchestration owns user confirmation.

## Permanent deletion and recovery

Only already-trashed media may be purged. A durable transaction locks/rechecks it,
commits `purgeStartedAt` and captures the recorded variant manifest. Restore and
new variant writes are blocked after purging starts. The deletion service validates
all keys against the selected media, deduplicates them, then removes recorded
objects sequentially. Missing-object deletion is idempotent. Database rows and
relations are finalized only after every storage operation succeeds.

Partial storage failure or database finalization failure preserves the marker and
manifest for retry. Retention cleanup uses the same workflow and rechecks the
cutoff under lock. No arbitrary force flag, live-media permanent-delete shortcut
or prefix deletion exists. This workflow does not enumerate unrecorded orphans or
revoke downloaded copies. Staging/orphan reconciliation, storage lifecycle cleanup,
backups and restore procedures remain deployment responsibilities. Review and
correct invalid manifests before retrying; do not bypass key validation to unblock
an imported record.

## Verification scope

Colocated regression tests exercise strict upload fields/types, ignored inputs,
filename/MIME agreement, size signing with real offline SigV4, staging-key
confinement, decoded MIME mismatch, expiry settings, safe signing projections,
headers/errors, origin/preflight rejection, rate limiting, traversal, purge
confinement/retry, React text rendering and cancelled destructive confirmations.
Existing tests cover credentials/configuration validation, immutable originals,
trash transactions, raw-error normalization and destructive confirmation contracts.

Run `npm test`, `npm run lint`, `npm run format:check` and the web build. Real
PostgreSQL/Redis/S3 checks remain opt-in as documented in their architecture files.
Offline signatures and mocked storage tests do not prove a production storage
service's enforcement or a browser deployment's CORS/TLS configuration.
