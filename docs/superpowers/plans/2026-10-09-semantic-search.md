# Semantic Search Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add isolated, opt-in semantic indexing and search.

**Architecture:** Inject embedding and tagging providers and a vector-index port. Persist
derived records separately and reconcile in an independent worker.

**Tech Stack:** JavaScript ES modules, Fastify, Prisma/PostgreSQL, BullMQ, Vitest.

**Spec:** docs/superpowers/specs/2026-10-09-semantic-search-design.md

## Global Constraints

Preserve metadata search, media IDs, storage keys, manual tags and core media statuses.
Dimensions 1–4096; limit 1–100 (default 20); reconcile 50 records/minute; failure delay five minutes.

## Review Focus

Nonfinite/zero vectors must fail safely; changed sources must not publish stale results;
trashed sources must disappear; cross-query cursors must fail; disabled AI must not affect startup.

### Task 1: Services and validation

Files: modules/semantic-search/{validators/semantic.validator.js,services/semanticSearch.service.js,
services/semanticIndexing.service.js,services/semantic.test.js} under apps/api/src.
Interfaces: createSemanticSearchService({repository, vectorIndex, embeddingProvider});
createSemanticIndexingService({repository, storage, embeddingProvider, tagProvider}).

- [x] Write tests for text/similar search, profile validation, cursors and indexing lifecycle.
- [x] Run focused Vitest and confirm missing implementation fails.
- [x] Implement validated providers, search and index/reconcile services; rerun tests.

### Task 2: Persistence and worker

Files: Prisma schema and additive migration; semantic.repository.js; jobs/semanticIndexing.*.js;
infrastructure/ai/semanticProviders.js; queue/queue.js.
Interfaces: repository loadSource/save/fail/findCandidates/getIndex/search; vectorIndex.search.

- [x] Write integration tests for known-vector ranking, stale/trash exclusion and CAS saves.
- [x] Implement separate SemanticIndex persistence and SQL vector index.
- [x] Add dedicated queue, reconciliation scheduler and worker with safe startup/shutdown.
- [x] Verify schema generation and worker tests; database tests when services are available.

### Task 3: HTTP and composition

Files: semantic module public index/routes/controller; app/app.js, registerPlugins.js, server.js;
API route tests; docs/architecture/SEMANTIC_SEARCH.md; README.md; .env.example; API package.json.

- [x] Write failing HTTP tests for authentication, validation, disabled routes and result shape.
- [x] Compose opt-in module, provider loader and worker entry point; document adapters and limits.
- [x] Run full test suite, lint, format checks, and review final diff.

## Execution record

Implemented inline in the existing workspace as authorized. No provider/vendor SDK was
selected. Review found retry starvation and subnormal vector normalization; both received
failing regression tests before correction. The authentication migration test fixture was
updated to select its migration explicitly after the additive semantic migration exposed
its assumption that authentication was always the last migration.
