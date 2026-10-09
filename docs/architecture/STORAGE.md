# Backend storage abstraction

Storage lives in `apps/api/src/infrastructure/storage`. The public `index.js` exports
`createStorageProvider`, the `StorageProvider` contract, `StorageError`, and
`generateStorageKey`. All handwritten code is JavaScript. The S3 adapter uses the
[AWS SDK v3 client and presigner](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html).
S3 Ninja is a local S3-compatible server, never an application dependency.

## Composition and dependency direction

`app/server.js` loads validated server-only storage configuration, creates one provider,
and wires `close()` into Fastify shutdown. Construction opens no connection or bucket;
there is no storage readiness probe or media upload workflow. Tests can build an
application without storage or inject a substitute. No new HTTP endpoints exist.

Future module composition passes that provider into services:

```js
// Application/module composition:
// const service = createMediaService({ repository, storage });
// Service implementation calls storage.upload(...) without importing an S3 client.
```

Business services depend on the contract and receive a provider, never AWS SDK,
S3 Ninja routes, client construction, or concrete S3 adapters. Controllers call
services. ESLint rejects SDK/adapter imports in business modules and direct storage
imports from controllers. Vendor code stays inside `storage/s3`.

## Provider contract

Operations accept an options object and return promises, except synchronous `close()`.
Object keys are relative to the configured bucket, without a bucket name or leading slash.

| Method                       | Input                                                   | Result                                                                                           |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `upload`                     | `{ key, body, contentType, contentLength?, metadata? }` | `{ key, etag }`                                                                                  |
| `delete`                     | `{ key }`                                               | Resolves without a value; missing-object delete is idempotent on S3                              |
| `exists`                     | `{ key }`                                               | Boolean; permission/network/bucket errors still throw                                            |
| `getObjectMetadata`          | `{ key }`                                               | `{ key, fileSize, contentType, etag, lastModified, metadata }`, or `null` for a missing object   |
| `createPresignedUploadUrl`   | `{ key, contentType, expiresIn? }`                      | `{ url, method: 'PUT', headers, expiresIn }`                                                     |
| `createPresignedDownloadUrl` | `{ key, expiresIn?, method? }`                          | `{ url, method: 'GET' or 'HEAD', headers, expiresIn }`                                           |
| `copyObject`                 | `{ sourceKey, destinationKey, sourceEtag? }`            | `{ key, etag }` for the destination                                                              |
| `getProviderMetadata`        | None                                                    | Safe `{ providerType, endpointHost, bucketName }`; unavailable fields are `null`; no network I/O |
| `close`                      | None                                                    | Destroys owned clients once; subsequent operations reject                                        |

Upload bodies can be strings, Uint8Array/Buffer, or Node Readable streams. Streams
require a known `contentLength`. This foundation uses single-object PUT, not multipart
upload; its maximum is 5 GiB. Add multipart capability deliberately when required.
Metadata is a map of lowercase ASCII names to string values, without control characters.
Copy stays within one configured bucket, encodes the source key, and rejects self-copy.
When sourceEtag is supplied, the adapter sends CopySourceIfMatch so upload completion
can preserve the exact staged object version it verified.

Original-object immutability belongs to service orchestration: persist unique UUID
keys, never upload/copy over an existing original, and handle retries explicitly.
The generic provider itself follows S3 overwrite semantics and does not implement a
race-prone HEAD-before-PUT guard. It does not rename or delete objects when albums change.

Signing defaults to 900 seconds and accepts 1–604800 seconds. Browser callers use the
returned method and headers exactly, especially the signed upload `content-type`.
GET and HEAD require separately signed URLs. URLs grant temporary access; do not log
them or place them in permanent public metadata. A presigned PUT does not validate
business state, file contents, quota, or post-upload processing; these belong to the
future upload workflow. No secret access key is returned. The SigV4 URL contains the
normal access-key identifier and signature, which differ from the secret signing key.

Provider failures become a safe `StorageError` without vendor message, cause, stack
contents, or signed URLs from the original exception. Boundary validation rejects
invalid keys/types/expiry using fixed TypeError messages. The existing centralized
HTTP error handler can sanitize these when future endpoints are added. A missing
object is distinct from a missing bucket or denied permission.

## Environment and endpoints

Use `loadStorageConfig()` or `validateStorageEnvironment(environment)` in composition.
The loader uses root `.env` and existing process variables take precedence.

| Variable              | Behavior                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `STORAGE_DRIVER`      | `s3` only; defaults to `s3`                                          |
| `S3_ENDPOINT`         | Required backend operations origin, e.g. `http://localhost:9445`     |
| `S3_PUBLIC_ENDPOINT`  | Browser signing origin; defaults to `S3_ENDPOINT`                    |
| `S3_REGION`           | Required, e.g. `us-east-1`                                           |
| `S3_BUCKET`           | Required bucket name                                                 |
| `S3_ACCESS_KEY`       | Required backend-only access key identifier                          |
| `S3_SECRET_KEY`       | Required backend-only secret signing key                             |
| `S3_FORCE_PATH_STYLE` | Strict `true`/`false`; defaults to `true` for local S3 compatibility |

Endpoints must be HTTP(S) origins, without embedded credentials, path prefixes,
query strings, or fragments. The backend client uses `S3_ENDPOINT`; a separate signing
client uses `S3_PUBLIC_ENDPOINT`. Never change a signed URL's host/path after signing.
A containerized backend uses `http://s3ninja:9000`; a host browser typically uses
`http://localhost:9445`. Use HTTPS and deployment-provided secrets in production.
Configuration stays in the API; do not serialize it or export it from shared/browser code.

Optional automatic SDK request/response checksums are disabled with `WHEN_REQUIRED`
for S3 emulator compatibility. This does not compute the application's SHA-256 media
checksum; processing will own that. Local bucket creation and browser CORS remain
infrastructure responsibilities described in the root README, not provider methods.

## Object keys

`generateStorageKey({ id, createdAt, filename, variant = 'ORIGINAL' })` requires a
media/upload UUID and a valid Date. Use the persisted creation date for all retries
and variants; do not recompute the partition from the processing date.

```text
media/YYYY/MM/DD/{uuid}/original/{filename}
media/YYYY/MM/DD/{uuid}/optimized/{filename}
media/YYYY/MM/DD/{uuid}/preview/{filename}
media/YYYY/MM/DD/{uuid}/thumbnails/{filename}
```

The partition uses UTC. UUIDs are lowercase. No album name, slug, current user, or
user-supplied directory controls the object prefix. Client Windows/POSIX path
components are discarded; filenames are normalized, limited to ASCII letters,
numbers, period, underscore, and hyphen, and capped at 180 characters with their
extension preserved up to 20 characters. Control characters and empty/dot-only
names reject. Original display filenames remain in database metadata.

Variant values match Prisma: ORIGINAL, OPTIMIZED, PREVIEW, THUMBNAIL,
BLUR_PLACEHOLDER. Blur placeholders use `preview/`; give them a distinct filename
such as `blur.jpg` so they cannot collide with a preview. Variant format/size should
also be encoded in the filename where multiple renditions exist. Sanitization may
map different client filenames to the same basename; allocate a distinct UUID per
upload/media identity rather than using filenames as identity.

## Verification

Unit tests cover deterministic UTC keys, variants, filename/path sanitization,
validation, configuration, adapter commands, missing/error behavior, lifecycle,
and real SigV4 public-endpoint signing without network access.

Run `npm run test:storage --workspace @album-manager/api` against configured local
S3 Ninja to verify backend upload/metadata/exists/copy/delete and presigned PUT/GET/HEAD.
The test creates a temporary bucket and removes its objects/bucket afterward.
It requires local bucket-management permissions and is excluded from default tests.
Browser CORS is configured by the local Nginx sidecar; fetch smoke tests verify the
signed HTTP operations but do not emulate a browser's CORS enforcement.

## Worker reads

`StorageProvider.read({ key })` returns encoded object bytes as a Buffer. The S3
adapter reads through its internal client and maps request/body failures to a
sanitized StorageError. The worker never uses vendor SDK calls or signed URLs.
Original keys are read only; all generated assets have separate derivative keys.
