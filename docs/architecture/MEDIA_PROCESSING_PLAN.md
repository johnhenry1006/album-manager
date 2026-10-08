# Media-processing worker implementation plan

Goal: implement the requested twenty-step image-processing flow using existing domain boundaries, with the approved schema and EXIF prerequisites.

Design: a validated BullMQ job calls a media orchestration service. A checksum gate serializes detection/reservation, a rendition service uploads and registers derivatives, and a processing repository owns upload/metadata state transactions. Storage and Sharp remain injected adapters. Originals are immutable. Rendition names distinguish thumbnail sizes; indexed checksums support explicitly accepted duplicates.

- [x] Add failing orchestration and prerequisite tests: duplicates/defaults, explicit duplicates, metadata/settings, three thumbnails, placeholder, complete retry, partial upload/row retries, original preservation, failures and invalid/mismatched payloads.
- [x] Add migration, named variant identity, deterministic checksum lookup, storage reading and EXIF extraction. Update existing repository/integration contracts.
- [x] Implement focused processing services and transactional repository. Serialize checksum detection and reservation with a transaction advisory lock. Use deterministic content-addressed derivative keys and reuse registered rows.
- [x] Add BullMQ worker lifecycle and dedicated executable composition, including readiness, sanitized errors, retries, graceful cleanup and configuration.
- [x] Run focused tests, root suite, lint, formatting, schema generation and available isolated integration checks. Review retries, cancelled/deleted inputs, concurrent duplicate/variant writes, partial finalization and schema backfill.

Execution: inline in the current authorized workspace. No production migration is applied automatically.

Verification: root suite passed (13 tooling tests, 265 API tests; 29 opt-in tests skipped). Isolated PostgreSQL/Redis checks passed (14 tests), including competing admissions, durable retry admission and real worker retry. Prisma Client generation and lint passed. Changed files pass Prettier and git diff --check. Root format:check reports pre-existing formatting in apps/web/jsconfig.json, apps/web/package.json, apps/web/vite.config.js and packages/shared/package.json; those files are unchanged. Independent review rechecked the admission and fatal-loop fixes and found no remaining substantive blockers. Production migrations were not applied.
