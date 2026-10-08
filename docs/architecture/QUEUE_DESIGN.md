# Queue infrastructure design

Status: the media-processing producer is implemented for the upload API. The broader
queue/worker infrastructure below remains proposed. The producer exposes readiness,
job acceptance with stable media IDs, retries, and shutdown through `infrastructure/queue/index.js`;
no workers or media-cleanup queue are registered. See [Direct uploads](../api/UPLOADS.md).

## Scope and boundaries

Implement Redis and BullMQ infrastructure in `apps/api/src/infrastructure/queue`
using JavaScript ES modules. Export the deliberate public interface through
`index.js`. Define `QUEUE_NAMES.MEDIA_PROCESSING` as `media-processing` and
`QUEUE_NAMES.MEDIA_CLEANUP` as `media-cleanup`.

Infrastructure owns Redis connections, queue construction, worker lifecycle,
retry defaults, event logging, and resource cleanup. Future `src/jobs` handlers
validate their job payloads and invoke business services. Image processing,
cleanup business logic, media job schemas, and HTTP endpoints are outside this
change. Do not register workers without real handlers.

## Approach

Use BullMQ with ioredis and one explicitly owned queue infrastructure instance
per process. This follows the existing database owner pattern and avoids
import-time connections or process-global singletons.

Alternatives are passing connection options to every BullMQ instance, which
duplicates connections and lifecycle ownership, or a process-global Redis
singleton, which complicates isolated tests and independent process composition.
The explicit owner provides shared clients and predictable cleanup.

## Connections and configuration

A shared Redis connection factory creates role-specific clients from validated
backend configuration. Producer queues share a producer client with bounded
request retries and the offline command queue disabled. Workers share a
separate client with `maxRetriesPerRequest: null`; BullMQ owns the additional
blocking connections it creates internally. Attach Redis error listeners before
connecting and never log credentials or connection configuration.

Add a focused configuration module under `src/config`, using the existing
environment-loading convention. Settings and proposed defaults:

| Setting                    | Default         | Purpose                                         |
| -------------------------- | --------------- | ----------------------------------------------- |
| `REDIS_HOST`               | `localhost`     | Server hostname                                 |
| `REDIS_PORT`               | `6380`          | Host-run development port                       |
| `REDIS_PASSWORD`           | none            | Optional password; Compose requires one         |
| `REDIS_DB`                 | `0`             | Nonnegative Redis database index                |
| `REDIS_TLS`                | `false`         | Enable TLS for hosted Redis                     |
| `REDIS_CONNECT_TIMEOUT_MS` | `10000`         | Connection timeout                              |
| `QUEUE_PREFIX`             | `album-manager` | BullMQ key namespace                            |
| `QUEUE_JOB_ATTEMPTS`       | `3`             | Total executions, including the initial attempt |
| `QUEUE_BACKOFF_DELAY_MS`   | `1000`          | Initial exponential retry delay                 |
| `QUEUE_WORKER_CONCURRENCY` | `1`             | Per-worker processing concurrency               |

Reject malformed hosts, ports, integers, booleans, and queue prefixes without
including supplied values in errors. Document settings in `.env.example`.
Keep all credentials server-only.

## Queue and worker helpers

The infrastructure owner exposes queue creation by a supported queue-name
constant, returning one queue per name. Queue defaults specify three total
attempts and BullMQ's built-in exponential backoff starting at one second.
Retain failed jobs for inspection; bound completed-job retention. Callers can
use BullMQ's per-job options for deliberate overrides.

Worker creation requires a supported queue name and an injected processor
function. Install failed-job and worker-error listeners before processing
starts. Log queue name, job ID, job name, attempt count, and sanitized failure
metadata without payloads or Redis credentials. Transport errors and failed
jobs are distinct events; retries remain BullMQ's responsibility.

Document the at-least-once delivery contract: future processors must be
idempotent and throw `Error` objects for failures. Domain payload validation
belongs at the future job boundary, rather than inventing media schemas here.

## Startup and graceful shutdown

Provide explicit readiness and an idempotent `close()` operation. Close workers
gracefully first, awaiting active processors, then close producer queues, then
release shared Redis clients. Attempt remaining cleanup when one resource
fails, and report cleanup failure through a sanitized error. Reject resource
creation once closing begins. Release partially initialized resources when
startup fails.

Allow `buildApp` to accept an injected queue owner, with readiness and close
hooks following database/storage composition. `startServer` loads queue
configuration and supplies the owner and application logger. Preserve
database-free and queue-free HTTP tests. Existing SIGINT/SIGTERM handling and
the API shutdown deadline apply to queue cleanup; infrastructure does not
install global signal handlers. Future dedicated worker entry points must
compose the same owner and await its shutdown.

Redis already exists in Docker Compose with authentication and AOF persistence.
Explicitly configure `maxmemory-policy noeviction` for queue data.

## Verification and documentation

Colocated Vitest tests cover environment validation, constants, retry/backoff
defaults, connection roles, shared connection ownership, lifecycle ordering,
repeated/concurrent close calls, cleanup failures, and failed-job logging.
Use real pure configuration code; use transport doubles only for unavailable
external resources. Add an opt-in Redis integration test for real queue
dispatch, retry, worker completion, and shutdown with unique key namespaces
and test-owned cleanup.

Update `BACKEND_STRUCTURE.md` and add queue responsibilities/usage documentation
under `docs/architecture`. Run queue tests, the repository test command, lint,
and formatting checks before reporting completion. Record separately any
integration checks that cannot run against an available Redis service.

## References

- [BullMQ connections](https://docs.bullmq.io/guide/connections)
- [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)

## Implemented media worker

The dedicated process and transport helper live in `src/jobs/mediaProcessing.*`.
Run `npm run worker:media --workspace @album-manager/api`; concurrency is validated
from QUEUE_WORKER_CONCURRENCY (default 1, maximum 32). Worker-owned connections have
maxRetriesPerRequest null; listeners are registered before run(), readiness has a
deadline, and fatal loop errors trigger runtime cleanup and unsuccessful exit.
The producer supports explicit duplicate acceptance with a separate stable job ID.
See [Media-processing worker](MEDIA_PROCESSING.md) for domain flow and persistence.
