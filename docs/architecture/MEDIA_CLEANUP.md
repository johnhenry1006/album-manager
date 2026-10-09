# Media cleanup worker

Run `npm run worker:cleanup --workspace @album-manager/api` as a dedicated process
with the same database, storage, Redis database and `QUEUE_PREFIX` as the API.
Deploy the existing trash migration and regenerate Prisma before starting it.
`TRASH_RETENTION_DAYS=30` defaults to thirty days; configuration accepts whole days
from 1 to 36500. Retention is elapsed UTC time, not calendar dates.

## Scheduling and process ownership

Installed BullMQ 6.3.11 supports `Queue.upsertJobScheduler`. The separate
`mediaCleanup.schedule.js` module upserts `trash-retention-cleanup` on the
`media-cleanup` queue, with cron `0 0 * * * *` and `tz: UTC`. It runs at the top
of every hour. Every cleanup process registers the same ID in the same queue
namespace, so concurrent startups update one scheduler instead of adding schedules.
No process-local timers or legacy repeatable-job APIs are used.
See [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers/).

The schedule persists in Redis after process shutdown; jobs require an active
cleanup worker to run. Use a consistent retention configuration across workers.
The job payload is an empty object: callers cannot override retention or inject
a more destructive cutoff. Importing worker/server modules has no connection,
schedule registration or destructive side effects. The HTTP server does not
start cleanup; explicitly run the dedicated command.

The process connects the database, registers the schedule, then starts consumption.
Shared worker infrastructure provides bounded readiness, retry-friendly worker
connections, sanitized failure events and fatal-loop handling. Shutdown drains
active jobs before closing the scheduling queue, storage and database. Signals
and partial-startup failures follow the existing media worker lifecycle.

## Cleanup orchestration

The job composition enters `mediaCleanup.service.js` through the public media
module. It computes a retention cutoff using validated server policy, then reads
pages of fifty IDs using `(deletedAt ASC, id ASC)` and a matching value cursor.
Advancing past failed candidates prevents broken objects from starving later media.
The existing trash service rechecks eligibility under the media lock and skips
missing, restored or recently re-trashed records.

Each purge commits `purgeStartedAt` and captures the recorded variant manifest
before contacting storage. The storage deletion service validates all keys before
removing any object, deduplicates keys and deletes every recorded variant,
including the original. Missing objects are successful idempotent deletions.
Only after all storage operations succeed does a second transaction delete the
variant and media records. Restore and new rendition writes are blocked once
purging begins. Unrecorded orphan objects require separate reconciliation.

Storage or database finalization failures retain the marker and manifest. The
service logs each failed media ID with a safe error code and continues scanning,
then throws to mark the BullMQ attempt failed. The scheduler template provides
three total attempts with exponential backoff starting at one second; failed jobs
remain available for inspection and completed history is bounded to 1000 jobs.
Later hourly sweeps also retry records after attempts are exhausted. At-least-once
or concurrent delivery is safe: already removed objects and records are harmless.

## Verification

`npm test --workspace @album-manager/api` runs mocked-storage orchestration,
configuration, scheduler, repository cursor, worker and runtime tests. Tests cover
partial object removal, finalization failure, idempotent retry, concurrent restores
and purges, full-manifest validation, failure logging and continued pagination.
They do not start real cleanup workers, register real schedules or delete real
storage objects. Existing database/storage integration tests remain opt-in.
