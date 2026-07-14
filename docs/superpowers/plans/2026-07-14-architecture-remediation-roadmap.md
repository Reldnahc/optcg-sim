# Architecture Remediation Roadmap

> **For agentic workers:** This is a roadmap, not a single execution plan. Use
> the linked implementation plans in dependency order and commit each task as a
> focused change.

**Goal:** Correct the architecture defects identified in the July 2026 audit
without combining hidden-information, parser, engine, package, and observability
changes into one migration.

**Authority:** `AGENTS.md`, the cited sections under `specs/`, and
`docs/code-standard.md` remain authoritative. This roadmap supersedes the weak
certificate-completeness assumption in the June 8 scalable-card roadmap and
detailed certificate plan. Existing June plans remain useful historical context,
but a non-empty evidence list is no longer an acceptable definition of a
complete parser certificate.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, ESLint,
Prettier, Node.js `AsyncLocalStorage`, and the existing simulator packages.

---

## Logical Workstreams

1. **Safety And Contract Boundaries**
   - Visibility, player transport, bot observation, and public turn DTOs.
   - Execute first because the current defects can expose hidden information.
2. **Scalable Card Support Authority**
   - Parser evidence certification, generic parser composition, and generic
     replacement runtime.
   - Keep proof, syntax composition, and execution as separate review surfaces.
3. **Ownership And Runtime Isolation**
   - Package authority realignment plus explicit engine/server runtime context.
   - Extract packages only after their input and semantic APIs are stable.

## Plan Set

| Plan                                                                                       | Audit concerns                                                             | Primary outcome                                                   |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Visibility And Observation Boundaries](./2026-07-14-visibility-observation-boundaries.md) | Bot receives all player views; public snapshot aliases internal turn state | Separate trusted snapshots, player payloads, and bot observations |
| [Parser Evidence Certification](./2026-07-14-parser-evidence-certification.md)             | Any non-empty evidence list certifies a line                               | Prove evidence for every emitted primitive boundary               |
| [Generic Parser Composition](./2026-07-14-generic-parser-composition.md)                   | Exact multi-primitive full-line parsers                                    | Parse atomic primitives and compose them generically              |
| [Generic Replacement Runtime](./2026-07-14-generic-replacement-runtime.md)                 | Exact replacement sequence-length and combination gates                    | Admit and execute replacement compositions recursively            |
| [Package Authority Realignment](./2026-07-14-package-authority-realignment.md)             | Bot/API concerns in match-server; effects and Redis in one cards barrel    | Restore explicit package ownership and dependency direction       |
| [Runtime Context Isolation](./2026-07-14-runtime-context-isolation.md)                     | Module-global battle continuation and request timing context               | Remove import-order and concurrent-request ambient state          |

## Required Execution Order

1. **Visibility And Observation Boundaries**
   - This is the highest-risk fairness and public-contract work.
   - It creates the safe bot-facing API needed before moving bot code.
2. **Parser Evidence Certification**
   - This establishes trustworthy support authority before parser or runtime
     migrations can claim generated support.
3. **Generic Parser Composition** and **Generic Replacement Runtime**
   - These may proceed as separate branches after certificate semantics are
     stable.
   - Merge parser work before deleting compatibility evidence mappings.
4. **Runtime Context Isolation**
   - This is independent of card-support work and may run alongside steps 2-3,
     but should land in its own commits.
5. **Package Authority Realignment**
   - Move the bot only after `BotObservation` is stable.
   - Move effect parsing/materialization only after certificate and parser
     composition APIs are stable.
   - Move platform/API responsibilities only after endpoint ownership is
     agreed with the sibling API repository.

## Cross-Plan Invariants

- Raw `GameState` and any direct projection such as `GameState[turn]` must not
  define a player-facing or bot-facing transport contract.
- A live bot receives no information that the corresponding human player view
  does not receive unless an explicit game-format policy makes that information
  public to both.
- Parser evidence, runtime capability, and diagnostics remain separate
  authorities.
- A generated effect is supported only when every emitted entry point, cost,
  condition, target, filter, quantity, duration, reference, composition, and
  body primitive has parser evidence and runtime support.
- Exact card IDs, printed full lines, parser-rule IDs, shape IDs, and runtime
  capability IDs cannot certify generated support.
- Replacement behavior uses the same reusable primitive semantics as normal
  effect resolution while preserving replacement timing and semantic events.
- `engine-core` remains free of React, browser, transport, Redis, Postgres,
  live HTTP, and Node request-context dependencies.
- Public response shapes remain backward compatible. Required fields are not
  added and existing fields are not removed without explicit approval and a
  versioned migration.
- Touched files above the 800-line high-risk threshold must be reviewed for a
  cohesive split. Do not perform token extractions solely to satisfy max-lines.
- Every migration slice adds a guard that prevents the removed architecture
  from returning.

## Delivery Slices

### Slice A: Lock Safety Boundaries

- Add failing hidden-information tests for bot inputs and state-sync payloads.
- Split internal, player-facing, and bot-facing snapshot types.
- Remove direct opponent deck setup access from the default live bot path.
- Preserve the current wire shape where compatibility requires it.

### Slice B: Make Support Authority Real

- Derive required evidence from the emitted typed effect tree.
- Compare required evidence with evidence actually emitted by primitive parsers.
- Fail closed with precise missing records.
- Add negative authority and source-scan tests.

### Slice C: Remove Exact Composition Shapes

- Introduce missing generic saved-value and connector composition.
- Migrate exact body-line parsers into atomic parser plus composer flows.
- Replace exact replacement combinations with recursive admission/execution.
- Delete the specialized authorizers only after cross-product tests pass.

### Slice D: Restore Ownership And Runtime Isolation

- Remove process-global continuation and timing state.
- Extract bot and effects packages behind stable APIs.
- Move or port platform endpoints out of match-server.
- Add dependency-direction tests at every new package boundary.

## Commit And Review Strategy

- One logical task per commit.
- Contract changes land before implementations that consume them.
- Compatibility adapters and their deletion must not be in the same commit
  unless the migration is purely mechanical and fully covered.
- Do not mix bot behavior tuning with bot observation-boundary work.
- Do not mix new card support with parser or replacement architecture migration.
- Do not mix package moves with behavioral changes.

## Verification Baseline

Each execution plan must run its focused tests plus:

```sh
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:hidden-info
corepack pnpm test:tooling
corepack pnpm contracts
corepack pnpm coverage
corepack pnpm verify
```

If the full suite is intentionally deferred for an intermediate commit, record
that in the commit message or PR and run it before the plan is considered
complete.

## Roadmap Completion Criteria

- Bot strategy inputs contain one filtered player observation, not a map of all
  player views.
- State-sync payloads contain only public DTO types and no internal turn fields.
- Parser certificates reject every synthetic incomplete-evidence case.
- No production parser authorizes a supported multi-primitive effect by one
  exact printed full-line rule.
- Replacement support contains no full-sequence-size authorization gates.
- `@optcg/bot` and effect-definition/parser ownership are separated from their
  current host packages, with compatibility boundaries documented.
- Match-server no longer owns account/platform persistence behavior.
- Engine behavior is independent of module import order.
- Concurrent timing traces remain isolated by request.
- Architecture, hidden-information, contract, and cross-product tests prove all
  of the above.
