<!-- agent-packet:story-id ENG-002F -->
<!-- agent-packet:story-path stories/approved/ENG-002F-engine-replay-smoke.yaml -->
<!-- agent-packet:story-sha256 091a4ee972a72f08f7af90619a5d39aaa35a82a547f50c4c506123ea5cc9f652 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-002F
Epic ID: M1-001
Title: Add first engine replay smoke fixture
Type: verification
Area: replay
Primary Concern: verification

## Why

Add a narrow golden replay smoke fixture for the deterministic setup, mulligan, phase, and action skeleton, proving the same seed and action script reconstruct the same checkpoint hashes before the full replay subsystem exists.

## Authoritative Spec References

- 03-game-state-events-decisions.s020 (State hashing)
- 08-replay-rollback-recovery.s002 (Replay goals)
- 11-testing-quality.s010 (Golden replay tests)
- 11-testing-quality.s012 (Replay drift tests)
- 12-roadmap.s005 (Milestone 1: terminal engine)
- 12-roadmap.s015 (Immediate next tasks)
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
- 22-v6-implementation-tightening.s012 (8. Replay determinism)
- 22-v6-implementation-tightening.s017 (Remaining known risks)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s020 (State hashing)

Replays and recovery need state hashes.

```ts
interface StateHashInput {
  state: GameState;
  includeHidden: boolean;
  normalizeTransientIds: boolean;
}
```

Use canonical JSON serialization:

- Stable object-key ordering.
- Stable array ordering.
- Exclude timestamps unless explicitly part of replay logic.
- Include hidden data for authoritative replay hashes.
- Use separate public-view hash for client sync if useful.

### 08-replay-rollback-recovery.s002 (Replay goals)

A replay must be able to reconstruct a match deterministically from:

- Initial deck lists and initial state.
- RNG algorithm plus either the actual revealed seed or a mandatory initial authoritative snapshot. A seed commitment alone is not reconstructable.
- Engine/rules/card/effect/banlist versions.
- Ordered player actions.
- Ordered decision responses.
- Checkpoint hashes and optional snapshots.

Do not assume the current deployed engine can replay old matches without version metadata.

### 11-testing-quality.s010 (Golden replay tests)

Store known game scripts and final state hashes.

```text
fixtures/replays/
  vanilla-basic-game.json
  blocker-counter-basic.json
  double-attack-life-trigger.json
  simultaneous-ko-triggers.json
  replacement-trigger-trash.json
```

CI replays them and checks:

- Final state hash.
- Checkpoint hashes.
- Event count/type sequence, optionally.
- No hidden-info leak in generated views.

### 11-testing-quality.s012 (Replay drift tests)

Whenever engine or effect definitions change:

1. Replay previous golden logs under the intended version bundle.
2. Compare checkpoint hashes.
3. Fail CI on unexpected drift.
4. Require migration/version-pin note for intentional drift.

### 12-roadmap.s005 (Milestone 1: terminal engine)

Deliverables:

- `GameState` model.
- Setup, draw, DON!!, main, end phases.
- Play Character/Stage/Event skeleton.
- Attack/battle/damage with vanilla cards.
- Event journal.
- State hash.
- CLI runner.

Exit criteria:

- Two sample decks can finish a vanilla match in CLI.
- Golden replay can reconstruct final hash.
- Invariant tests pass after every action.

### 12-roadmap.s015 (Immediate next tasks)

1. Create `@optcg/types` skeleton.
2. Define `GameState`, `PlayerView`, `Action`, `EngineEvent`, `PendingDecision` types.
3. Write invariant utilities.
4. Implement deterministic RNG wrapper.
5. Implement setup and vanilla turn flow.
6. Create CLI runner.
7. Add first golden replay test.

### 18-acceptance-tests.s003 (Milestone 1 - terminal engine)

```text
M1-001 setup creates legal starting state
M1-002 opening hand draw uses deterministic deck order
M1-003 official mulligan flow supports keep or redraw-five once per player in first-player-then-second-player order
M1-004 first player skips first draw
M1-005 first player gains only one DON!! on first turn
M1-006 second player cannot attack on their first turn
M1-007 active DON!! can be attached during Main Phase
M1-008 attached DON!! returns rested during Refresh Phase
M1-009 vanilla leader damage moves life to hand
M1-010 leader taking damage at 0 life loses at rule processing
M1-011 attacking rested character can K.O. it
M1-012 character played this turn cannot attack without Rush
M1-013 deck-out loses at rule-processing checkpoint
M1-014 concession immediately ends match and cannot be replaced
M1-015 state hash is stable for same seed and action log
M1-016 PlayerView hides opponent hand and deck order
M1-017 life setup orientation makes original deck top card bottom Life card
M1-018 attached DON!! has attached state and no active/rested state while attached
M1-019 start-of-main-phase trigger window resolves before Main Phase action priority
```

### 22-v6-implementation-tightening.s012 (8. Replay determinism)

A replay artifact must contain either:

```text
initialSnapshot
```

or:

```text
rngSeed + initialDeckOrders
```

A seed commitment alone is not enough to reconstruct a match.

Replay entries are split into:

- deterministic replay entries, and
- audit envelopes for client IDs, received timestamps, signatures, and transport metadata.

Only deterministic entries participate in replay hashing.

### 22-v6-implementation-tightening.s017 (Remaining known risks)

This pass makes the spec implementation-ready for the foundation. It does not eliminate all risk. The largest remaining work items are:

1. Convert all existing example card DSL snippets to schema-valid JSON fixtures.
2. Add official-ruling-backed edge cases as cards are implemented.
3. Decide whether initial public launch uses official images, proxied Poneglyph image URLs, or text-only placeholders.
4. Validate `contracts/database-schema-v6.sql` against the selected Postgres version and migration tool.
5. Produce the first golden replay fixture after Milestone 1 engine implementation.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only a package-local replay smoke fixture and test harness for the current engine-core APIs. Do not implement persisted replay artifacts, rollback, server recovery, CLI replay commands, or post-game full-information replay views.

## Scope

- add a small checked-in replay smoke fixture using deterministic setup input and supported ENG-002E actions
- add a test helper that replays the fixture through `createInitialState`, mulligan responses, and `applyAction`
- assert final authoritative state hash and checkpoint hashes
- exclude transport timestamps, signatures, and nondeterministic metadata from the fixture
- keep the fixture format explicitly local to engine-core smoke testing until the replay artifact contract is implemented

## Out of Scope

- production replay artifact schema
- persisted replay storage
- rollback or recovery behavior
- post-game full-information view generation
- CLI replay command
- attack, battle, damage, or full vanilla-game completion

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- fixtures/replays/**
- tests/engine/**

## Constraints

- do not approve this story until ENG-002E is done
- replay smoke must not become the production replay artifact schema
- deterministic replay entries must exclude transport timestamps and signatures
- no hidden-information view policy may be added in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- golden replay smoke test for setup plus at least one legal action
- negative test proving action-script drift changes the final hash or fails the checkpoint assertion
- fixture determinism assertion rejecting timestamp-like or transport-only fields

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- replaying the fixture from the same seed and action script produces the same checkpoint hashes
- changing an action in the fixture changes the final hash
- fixture entries contain deterministic engine inputs only
- the replay smoke test runs under root `pnpm verify`

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
