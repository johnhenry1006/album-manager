# Video Media Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline. Track RED/GREEN verification below.

**Goal:** Process and display videos through the existing Media architecture.

**Architecture:** Inject an FFmpeg video adapter into the existing worker. Reuse MediaMetadata, MediaVariant, image rendition generation and storage persistence.

**Tech Stack:** JavaScript, Prisma/PostgreSQL, FFmpeg/FFprobe, Sharp, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-video-media-design.md`

## Global Constraints

- No video-specific domain tables, queue, album/media infrastructure, or endpoints.
- Preserve album relations, tags, categories, favorites, trash, lexical search and storage abstraction.
- Originals remain immutable; duration is measured in seconds.
- Deployment requires ffmpeg/ffprobe with libx264 and AAC support.

## Review Focus

- Reject disguised containers, audio-only files and damaged input before READY.
- Honor rotation/sample aspect ratio and avoid invalid odd playback dimensions.
- Keep network protocols disabled for uploaded inputs and remove temporary files after errors.
- Recover retries without duplicating variants or bypassing checksum admission.
- Keep MP4 variants out of image previews and support signed playback URL refresh.

## Task 1: Processing adapter and worker

Files: new `apps/api/src/infrastructure/video-processing/ffmpegVideoProcessor.js` and test; existing `mediaProcessing.service.js`, its test, `mediaProcessing.job.js`, `mediaProcessing.server.js`.

Interfaces: adapter `inspect(bytes)`, `extractMetadata(bytes)`, `process(bytes, imageSettings)` returns image-compatible variant descriptors and OPTIMIZED/mp4/playback. Worker retains its existing repository and storage contracts.

- [x] Add and run failing real-video adapter tests and worker success/mismatch/retry tests.
- [x] Implement adapter and worker injection; verify with API tests.

## Task 2: Metadata and shared API

Files: Prisma schema and additive migration; Media detail repository and mapper; API regression tests.

Interfaces: nullable MediaMetadata fields duration, videoCodec, audioCodec, frameRate, bitrate exposed through existing detail metadata.

- [x] Add and run failing metadata exposure and shared-video relation tests.
- [x] Implement additive schema changes and projection; generate client and verify API tests.

## Task 3: Viewer and deployment guide

Files: `useMediaVariants.js`, `MediaDetailViewer.jsx`, `MediaMetadataPanel.jsx`, page tests, README.

Interfaces: hook separates image preview from playback; viewer consumes playback URL signed by existing detail API.

- [x] Add and run failing playback, metadata and image fallback tests.
- [x] Implement native video viewer and metadata display; document runtime/migration requirements.
- [x] Run full npm test, lint, format checks and web build; review full diff.

## Execution ledger

User approved implementation directly after reviewing the architectural direction. Work proceeds in the current shared workspace; no commits, branch integration, or deployment are requested.

Baseline: npm test fails in infrastructure/scripts/code-quality.test.js and setup-local-env.test.js before application suites run; investigate environment constraints and report verification separately.

Task 1: complete — real MP4/MOV/WebM, rotation, SAR, silent/odd-dimension playback, corrupt-frame rejection, container discrimination, and cleanup tests pass. Worker tests cover checksum admission, retry reuse and MIME mismatch.

Task 2: complete — additive metadata migration/client generation and detail API projection verified; isolated PostgreSQL tests cover shared relations, filters, trash/restore and permanent deletion.

Task 3: complete — native playback, poster, metadata and signed-URL refresh tests pass. Deployment prerequisites and migration instructions documented.

Verification: npm test passes (16 tooling, 455 web, 756 API; 123 opt-in API tests skipped). The selected PostgreSQL suites pass (13 tests), and earlier favorites/filter suites also pass. Lint, web production build, changed-file formatting and git diff --check pass. Global format:check still flags unchanged apps/web/src/services/httpClient.js and httpClient.test.js. PostgreSQL suites emit an existing pg query concurrency deprecation warning.

Review: independent reviewer reproduced corrupt-frame acceptance, unsupported 3GP detection and legacy MOV rejection. All three now have real-file regressions and are fixed; reviewer reverified original reproductions. Browser refresh regression also checks the new URL on the video element.

Ruling: use atom-aware supported-brand classification, legacy QuickTime detection, strict FFmpeg flags and error-level stderr rejection — FFmpeg 6 can still return zero after decoder errors. Existing Media lifecycle and storage persistence remain unchanged.

Final work remains uncommitted in the shared workspace; the application database was not migrated or deployed. PostgreSQL verification used isolated schemas only.
