# Final architecture audit implementation plan

**Goal:** Audit all 25 requested concerns and correct confirmed violations without changing application contracts.

**Architecture:** Keep pages/controllers thin and retain existing feature public APIs. Move domain-independent selection and cursor-page deduplication into the existing shared frontend directories. Add import-graph regression checks to the existing Node tooling suite.

**Tech stack:** JavaScript, React, TanStack Query/Virtual, Fastify, Prisma, Vitest, ESLint and Node tests.

**Spec:** The six architecture documents and the final-audit request.

## Constraints and review focus

- JavaScript only; no new dependencies or behavior changes.
- Preserve selection across filters/pages, retry reconciliation and stable callbacks.
- Preserve first-occurrence ordering and object identity when cursor pages overlap.
- Preserve media public exports for compatibility.
- Resolve relative imports and aliases when checking boundaries and cycles.
- Report documented pagination exceptions and skipped external integrations honestly.

## Tasks

1. Add focused selection/deduplication tests at the intended shared locations;
   verify they fail before extraction. Move implementations and update consumers;
   retain media compatibility exports. Run the frontend suite.
2. Add AST-based import graph checks in `infrastructure/scripts/architecture.test.js`
   using the existing ESLint parser. Check source boundaries, unresolved local
   imports, production imports of tests, direct page/component transport and cycles.
   Exercise negative fixtures as well as the repository graph.
3. Review large files, controllers, persistence, storage/jobs, payloads,
   pagination, validation/errors and critical-flow tests. Record all 25 outcomes
   and remaining debt in `docs/architecture/FINAL_AUDIT.md`.
4. Run `npm test`, lint, formatting, web build and diff checks. Record results
   and distinguish skipped integrations from verified behavior.

## Execution record

- Initial working tree was clean. Six required documents read before changes.
- Static inventory: 492 JavaScript source/test/tooling files, 363 non-test files;
  no production import cycles, forbidden deep imports or identical source files
  detected by the preliminary scan.
- Execute in the provided shared workspace; no branch, commit or publication is
  needed for this audit. The user authorized the refactors and verification.
- Completed shared extractions with focused tests (19 passing including existing
  media hooks), compatibility exports and migrated consumers.
- Completed AST graph/negative-fixture checks in the existing tooling suite.
- Completed all 25 review dispositions in `FINAL_AUDIT.md`; retained documented
  collection contract exceptions as debt.
- Full suite passed: tooling 16, frontend 445, backend 694; external integrations
  skipped 113. Lint/build passed. Pre-existing shared-manifest indentation was
  normalized to satisfy repository formatting; no manifest fields changed.
- Independent code review approved the changes without critical/important issues.
