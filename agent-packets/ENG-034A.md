<!-- agent-packet:story-id ENG-034A -->
<!-- agent-packet:story-path stories/approved/ENG-034A-split-terminal-replay-smoke-tests.yaml -->
<!-- agent-packet:story-sha256 61b9a360c68c8cd9d15b96f04fae3e5a6dd26493739c8fd98cd40a7f77974916 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-034A
Epic ID: KICK-001
Title: Split terminal replay smoke tests
Type: refactor
Area: engine
Primary Concern: verification

## Why

Move terminal and vanilla-combat replay smoke assertions out of replay-smoke.test.ts into focused replay smoke test files, with shared replay-smoke helpers extracted into test support, without changing replay fixtures, expected hashes, CLI behavior, or engine behavior.

## Authoritative Spec References

- 03-game-state-events-decisions.s020 (State hashing)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
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

### 11-testing-quality.s007 (Interaction tests)

Representative interactions:

```text
tests/interactions/
  blocker-plus-unblockable.test.ts
  double-attack-plus-banish.test.ts
  replacement-on-ko.test.ts
  simultaneous-ko-triggers.test.ts
  on-ko-source-presence.test.ts
  trigger-during-damage-defers.test.ts
  event-activates-effect-after-resolution.test.ts
  negative-power-stays-on-field.test.ts
  negative-cost-clamps-to-zero.test.ts
```

### 11-testing-quality.s008 (Invariant tests)

Run after every action, decision response, effect resolution, and replay step in test mode.

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertAttachedDonConsistency(state);
assertNoIllegalHiddenInfoInViews(state);
assertPendingDecisionIsValid(state);
assertEffectQueueEntriesAreResolvableOrCancelled(state);
assertStateHashStable(state);
```

### 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)

```text
M2-001 On Play draw queues and resolves
M2-002 When Attacking effect resolves before defender On Opponent Attack window
M2-003 blocker redirects attack and emits blockerActivated
M2-004 counter character grants battle power until end of battle
M2-005 counter event is trashed and effect resolves
M2-006 On K.O. activates on field and resolves from trash or last known info
M2-007 life Trigger resolves from no zone then moves to trash unless replaced
M2-008 simultaneous triggers controlled by same player require order decision
M2-009 turn player effect A, opponent effect B, new turn-player effect C resolves A-B-C
M2-010 damage-processing triggers wait until all damage points complete
M2-011 continuous +1000 modifier does not mutate base state
M2-012 replacement effect applies once per process
M2-013 optional effect creates chooseOptionalActivation decision
M2-014 target selection respects visibility and legal candidates
M2-015 unsupported non-vanilla card is rejected outside dev sandbox
M2-016 once-per-turn failed cost does not consume use
M2-017 once-per-turn committed effect that later fizzles still consumes use
M2-018 defender on-opponent-attack effects resolve before ordinary counter actions
M2-019 post-counter missing attacker or target skips Damage Step
M2-020 replacement choice uses chooseReplacement decision and logs replacementApplied
M2-021 replacement cannot apply twice to same process
M2-022 transient revealed card returned face-down is removed from opponent view
```

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

A pull request must not merge unless the main CI pipeline passes.

Minimum required merge gates:

1. install dependencies with locked versions,
2. build/typecheck workspace,
3. lint workspace,
4. run tests,
5. validate contracts and schemas,
6. validate formatting,
7. publish coverage artifact,
8. fail if generated artifacts or snapshots are stale when the repo defines them.

Recommended CI jobs:

- `quality` -> lint, typecheck, format check
- `engine` -> engine unit, interaction, invariant, replay tests
- `contracts` -> canonical types, DSL schema, fixture normalization, SQL/schema validation
- `client-server-smoke` -> protocol smoke tests and filtered-view checks

For protected branches, require at least one human review plus passing CI.

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

Own only behavior-preserving test organization for the ENG-002F terminal fixture and ENG-003E vanilla-combat fixture pass/final-hash assertions. This story may extract existing replay-smoke test helpers into a package-local test support module used by the remaining replay smoke tests.

## Scope

- move the ENG-002F terminal fixture reproduction and final-hash pinning assertions into replay-smoke-terminal.test.ts
- move the ENG-003E vanilla-combat fixture reproduction and final-hash pinning assertions into replay-smoke-vanilla-combat.test.ts
- extract existing replay smoke helper types, fixture loaders, replay runners, drift helpers, and metadata-key helpers into replay-smoke-test-support.ts without changing their behavior
- preserve all expected checkpoint hashes, final hashes, fixture contents, helper behavior, and assertion semantics

## Out of Scope

- changing replay fixtures
- changing checkpoint or final hash values
- changing CLI command behavior
- changing engine behavior
- moving play-card, drift, or metadata determinism assertions except where shared helper extraction is necessary
- adding production ReplayLog, rollback, recovery, storage, or replay viewer behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/replay-smoke.test.ts
- packages/engine-core/src/replay-smoke-test-support.ts
- packages/engine-core/src/replay-smoke-terminal.test.ts
- packages/engine-core/src/replay-smoke-vanilla-combat.test.ts
- stories/generated/ENG-034A-split-terminal-replay-smoke-tests.yaml
- stories/approved/ENG-034A-split-terminal-replay-smoke-tests.yaml
- agent-packets/ENG-034A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-034A packet while implementing this story
- target the ENG-034 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving test organization story; if a production change appears necessary, stop and split or record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/replay-smoke.test.ts packages/engine-core/src/replay-smoke-terminal.test.ts packages/engine-core/src/replay-smoke-vanilla-combat.test.ts
- run corepack pnpm --filter @optcg/engine-core typecheck
- run corepack pnpm run packets:verify
- run corepack pnpm run coverage
- run corepack pnpm run verify

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- replay-smoke-terminal.test.ts covers the existing ENG-002F reproduction and final-hash assertions
- replay-smoke-vanilla-combat.test.ts covers the existing ENG-003E reproduction and final-hash assertions
- replay-smoke.test.ts no longer contains those moved pass/final-hash assertion groups
- no replay fixture files, expected hashes, production files, CLI smoke scripts, or engine behavior change
- focused replay smoke tests, coverage, and full verify pass

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
