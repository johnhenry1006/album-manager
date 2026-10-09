# SDD ledger — plan: docs/superpowers/plans/2026-10-09-authentication.md

Execution: approved native in-place implementation; repository metadata remains unchanged per approved plan.
Pre-flight: Tasks 1/2 share repository/session interfaces; Tasks 3/4 share request.actor; Task 5 consumes auth JSON contracts. Signatures agree.
Task 1: in progress.
Task 2: Ruling: use a transaction advisory lock for owner provisioning instead of an unqualified row-lock SQL query — isolated schemas expose a raw-query search-path mismatch; advisory serialization preserves the owner-claim guarantee. Cost if wrong: provisioning races; integration tests cover concurrent claims.
Task 1: complete — domain/hash/config tests 6 passed; passwords verified with real scrypt.
Task 2: complete — isolated PostgreSQL auth migration/lifecycle/provisioning tests passed, existing-favorite IDs/timestamps preserved.
Task 3: complete — scoped hook/CSRF and every composed business feature protected; explicit auth test fixtures retain guards.
Task 4: complete — full PostgreSQL-enabled API suite 829 passed, 3 non-database integrations skipped.
Task 5: complete — frontend auth/login/race tests passed; initial full suite exposed asynchronous test assertions; waitFor now observes completed router/mutation notifications.
Task 6: in progress — docs updated, lint/build passed; final default suite/format/independent review remain.
Final: fixed late successful mutation responses after identity change — transport test reproduced a 204 reaching old-account callbacks; generic context fencing now rejects superseded responses (RED observed).
