---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "source-coverage-matrix"
doc_title: "Source Coverage Matrix"
doc_type: "traceability"
status: "canonical"
machine_readable: true
---

# Source Coverage Matrix

<!-- SECTION_REF: source-coverage-matrix.s001 -->

Section Ref: `source-coverage-matrix.s001`

This file records where the original PDF topics are represented in the Markdown package. The source text itself is preserved in `source-original-pdfs/`.

## `optcg-simulator-plan.pdf`

<!-- SECTION_REF: source-coverage-matrix.s002 -->

Section Ref: `source-coverage-matrix.s002`

| Original section                      | Rebuilt location                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Project Overview                   | `00-project-overview.md`, `README.md`                                                                                                                  |
| 2. High-Level Architecture            | `01-system-architecture.md`                                                                                                                            |
| 3. Module Breakdown                   | `01-system-architecture.md`                                                                                                                            |
| 3.1 Card Data Layer / Poneglyph       | `09-card-data-and-support-policy.md`, `01-system-architecture.md`, `10-database-schema.md`                                                             |
| 3.2 Game Rules Engine                 | `02-engine-mechanics.md`, `03-game-state-events-decisions.md`, `04-effect-runtime.md`                                                                  |
| 3.3 Match Server                      | `07-match-server-protocol.md`, `08-replay-rollback-recovery.md`                                                                                        |
| 3.4 Platform API                      | `01-system-architecture.md`, `10-database-schema.md`, `12-roadmap.md`                                                                                  |
| 3.5 Frontend Client                   | `01-system-architecture.md`, `06-visibility-security.md`, `07-match-server-protocol.md`                                                                |
| 3.6 Bot / AI                          | `01-system-architecture.md`, `12-roadmap.md`                                                                                                           |
| 4. Shared Contracts & Communication   | `01-system-architecture.md`, `03-game-state-events-decisions.md`, `07-match-server-protocol.md`, `16-typescript-interface-draft.md`                    |
| 5. Tech Stack                         | `01-system-architecture.md`                                                                                                                            |
| 6. Team & Ownership Model             | `01-system-architecture.md`, `12-roadmap.md`                                                                                                           |
| Workflow rules                        | `01-system-architecture.md`                                                                                                                            |
| 7. Development Phases                 | `12-roadmap.md`                                                                                                                                        |
| 8. Key Design Principles              | `README.md`, `00-project-overview.md`, `01-system-architecture.md`                                                                                     |
| 9. Rollback System                    | `08-replay-rollback-recovery.md`                                                                                                                       |
| 10. Anti-Cheat System                 | `06-visibility-security.md`, `07-match-server-protocol.md`                                                                                             |
| 11. Spectator Information Model       | `06-visibility-security.md`, `07-match-server-protocol.md`                                                                                             |
| 12. Observability & Metrics           | `01-system-architecture.md`, `07-match-server-protocol.md`, `08-replay-rollback-recovery.md`, `11-testing-quality.md`                                  |
| 13. Match Server Crash Recovery       | `08-replay-rollback-recovery.md`, `07-match-server-protocol.md`                                                                                        |
| 14. Database Schema                   | `10-database-schema.md`                                                                                                                                |
| 14.9 Redis vs Postgres                | `10-database-schema.md`, `08-replay-rollback-recovery.md`, `09-card-data-and-support-policy.md`                                                        |
| 15. Publication and mitigation policy | `12-roadmap.md`, `13-content-publication-policy.md`                                                                                                    |
| 16. Next Steps                        | `12-roadmap.md`, `15-implementation-kickoff.md`                                                                                                        |
| 17. Design Sweep List                 | `source-original-pdfs/original-optcg-simulator-plan.md`; incorporated across `12-roadmap.md`, `15-implementation-kickoff.md`, `18-acceptance-tests.md` |

## `optcg-engine-spec.pdf`

<!-- SECTION_REF: source-coverage-matrix.s003 -->

Section Ref: `source-coverage-matrix.s003`

| Original section                             | Rebuilt location                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Win/Loss Conditions                       | `02-engine-mechanics.md`                                                                          |
| Rule Processing Timing                       | `02-engine-mechanics.md`, `03-game-state-events-decisions.md`                                     |
| 2. Zones                                     | `02-engine-mechanics.md`, `06-visibility-security.md`                                             |
| Zone Transition Rules                        | `02-engine-mechanics.md`, `04-effect-runtime.md`                                                  |
| 3. Card Types & Properties                   | `02-engine-mechanics.md`, `03-game-state-events-decisions.md`, `16-typescript-interface-draft.md` |
| DON!! Card Mechanics                         | `02-engine-mechanics.md`                                                                          |
| 4. Turn Structure                            | `02-engine-mechanics.md`                                                                          |
| First Turn Restrictions                      | `02-engine-mechanics.md`                                                                          |
| 5. Battle Sequence                           | `02-engine-mechanics.md`, `03-game-state-events-decisions.md`, `04-effect-runtime.md`             |
| Damage Processing                            | `02-engine-mechanics.md`, `04-effect-runtime.md`                                                  |
| 6. Playing Cards - Cost Payment Flow         | `02-engine-mechanics.md`, `03-game-state-events-decisions.md`, `04-effect-runtime.md`             |
| 7. Effect System Overview                    | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                              |
| Auto Effect Keywords                         | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                              |
| Auto Effect Critical Rules                   | `04-effect-runtime.md`                                                                            |
| Effect Resolution Order                      | `04-effect-runtime.md`                                                                            |
| Replacement Effects                          | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                              |
| Permanent Effects Processing Order           | `04-effect-runtime.md`, `03-game-state-events-decisions.md`                                       |
| One-Shot vs Continuous Effects               | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                              |
| 8. Keyword Effects Reference                 | `02-engine-mechanics.md`, `05-effect-dsl-reference.md`                                            |
| 9. If vs Then Clauses                        | `02-engine-mechanics.md`, `05-effect-dsl-reference.md`                                            |
| 10. Impossible Actions & Edge Cases          | `02-engine-mechanics.md`, `05-effect-dsl-reference.md`, `18-acceptance-tests.md`                  |
| Loop handling                                | `02-engine-mechanics.md`, `04-effect-runtime.md`                                                  |
| 11. State Filtering & Information Visibility | `06-visibility-security.md`                                                                       |
| 11.1-11.9 View/filter subtopics              | `06-visibility-security.md`, `07-match-server-protocol.md`                                        |
| 12. Confirmed Rulings                        | `02-engine-mechanics.md`, `04-effect-runtime.md`                                                  |

## `optcg-effect-system.pdf`

<!-- SECTION_REF: source-coverage-matrix.s004 -->

Section Ref: `source-coverage-matrix.s004`

| Original section                   | Rebuilt location                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Architecture Overview           | `04-effect-runtime.md`, `05-effect-dsl-reference.md`, `01-system-architecture.md`          |
| 2. Representation Strategy         | `05-effect-dsl-reference.md`, `09-card-data-and-support-policy.md`                         |
| 2.1 Three-Phase Approach           | `05-effect-dsl-reference.md`, `09-card-data-and-support-policy.md`                         |
| Poneglyph automated generation     | `09-card-data-and-support-policy.md`, `05-effect-dsl-reference.md`                         |
| 2.2 Resolution Order               | `04-effect-runtime.md`, `05-effect-dsl-reference.md`                                       |
| 3. Effect DSL                      | `05-effect-dsl-reference.md`                                                               |
| 3.3 Triggers                       | `05-effect-dsl-reference.md`, `04-effect-runtime.md`                                       |
| 3.4 Conditions                     | `05-effect-dsl-reference.md`                                                               |
| 3.5 Costs                          | `05-effect-dsl-reference.md`, `03-game-state-events-decisions.md`                          |
| 3.6 Effects                        | `05-effect-dsl-reference.md`                                                               |
| 3.7 Targets                        | `05-effect-dsl-reference.md`, `03-game-state-events-decisions.md`                          |
| 3.8 Supporting Types               | `05-effect-dsl-reference.md`, `16-typescript-interface-draft.md`                           |
| 4. DSL Examples                    | `05-effect-dsl-reference.md`, `17-first-card-fixtures.md`, `18-acceptance-tests.md`        |
| 5. Custom Handlers                 | `04-effect-runtime.md`, `05-effect-dsl-reference.md`, `09-card-data-and-support-policy.md` |
| 6. Effect Runtime                  | `04-effect-runtime.md`, `03-game-state-events-decisions.md`                                |
| 6.1-6.5 Queue/choices/replacements | `04-effect-runtime.md`, `03-game-state-events-decisions.md`                                |
| 7. Continuous Effects Layer        | `04-effect-runtime.md`, `03-game-state-events-decisions.md`, ADR 0003                      |
| 8. Card Addition Pipeline          | `09-card-data-and-support-policy.md`, `12-roadmap.md`                                      |
| 8.3 DSL Coverage Tracking          | `09-card-data-and-support-policy.md`, `11-testing-quality.md`                              |
| 9. Testing Strategy                | `11-testing-quality.md`, `18-acceptance-tests.md`                                          |
| 10. Full Card Walk-through         | `05-effect-dsl-reference.md`, `17-first-card-fixtures.md`                                  |
| 11. Open Design Decisions          | `12-roadmap.md`, ADRs                                                                      |

## Audit note

<!-- SECTION_REF: source-coverage-matrix.s005 -->

Section Ref: `source-coverage-matrix.s005`

If a topic is missing from the implementation docs, check `source-original-pdfs/` first. The source extract is retained so nothing from the PDFs is lost while the implementation docs are refined.

## Supplemental source coverage added in v3

<!-- SECTION_REF: source-coverage-matrix.s006 -->

Section Ref: `source-coverage-matrix.s006`

| Supplemental source                 | Coverage                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Poneglyph OpenAPI JSON              | `19-poneglyph-api-contract.md`; endpoint matrix; Zod schema policy; batch max 60; search-vs-detail authority split; fixture file.               |
| OP01-060 Donquixote Doflamingo JSON | `20-card-implementation-examples.md`; transient reveal DSL; attached DON!! condition; variant index 0; FAQ hidden-info behavior; tests.         |
| OP05-091 Rebecca JSON               | `20-card-implementation-examples.md`; blocker keyword; sequence-local selections; name-exclusion filter; nullable product/market fields; tests. |
