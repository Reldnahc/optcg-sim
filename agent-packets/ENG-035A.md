<!-- agent-packet:story-id ENG-035A -->
<!-- agent-packet:story-path stories/approved/ENG-035A-split-general-legal-action-tests.yaml -->
<!-- agent-packet:story-sha256 b21a5f6c5291870b31dc919d928ed4690d79cd9d8420922a9bef5b43dd7048ca -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-035A
Epic ID: KICK-001
Title: Split general legal-action tests
Type: refactor
Area: engine
Primary Concern: verification

## Why

Move general getLegalActions main-phase, phase, turn-player, and concession tests out of actions.test.ts into a focused action dispatcher test file, with any shared setup extracted into package-local test support.

## Authoritative Spec References

- 03-game-state-events-decisions.s015 (Legal actions)
- 06-visibility-security.s007 (Legal-action visibility)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s015 (Legal actions)

`getLegalActions()` should return actions valid for the current game state and current pending decision.

```ts
function getLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  if (state.pendingDecision) {
    return legalResponsesForDecision(state.pendingDecision, playerId, state);
  }

  return legalPhaseActions(state, playerId);
}
```

Legal actions sent to a client must not leak hidden information. For example, the opponent should not receive an action list that implies exactly which hidden counter cards exist.

### 06-visibility-security.s007 (Legal-action visibility)

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

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

Own only behavior-preserving test organization for ordinary legal-action availability and concession-only fallback coverage. This story may extract existing actions.test.ts helper types and fixture builders into local test support used by later ENG-035 child stories.

## Scope

- move the existing turn-player main-phase legal-action test into actions-general.test.ts
- move existing non-main-phase and don-phase concession-only tests into actions-general.test.ts
- extract existing shared action-dispatcher test helper functions and branded-id helpers into action-dispatcher-test-support.ts without changing behavior
- preserve every assertion, fixture setup, and expected legal-action shape

## Out of Scope

- changing getLegalActions behavior
- changing applyAction behavior
- changing pending-decision, runtime-work, battle, or unsupported-action test coverage except where shared helper extraction is necessary
- changing hidden-information behavior
- changing production engine, server, client, replay, or CLI code

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/actions.test.ts
- packages/engine-core/src/action-dispatcher-test-support.ts
- packages/engine-core/src/actions-general.test.ts
- stories/generated/ENG-035A-split-general-legal-action-tests.yaml
- stories/approved/ENG-035A-split-general-legal-action-tests.yaml
- agent-packets/ENG-035A.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-035A packet while implementing this story
- target the ENG-035 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- this is a behavior-preserving test organization story; if production changes appear necessary, stop and split or record an ambiguity
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/actions.test.ts packages/engine-core/src/actions-general.test.ts
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

- actions-general.test.ts covers the existing main-phase turn-player and concession-only phase fallback assertions
- actions.test.ts no longer contains the moved general legal-action assertion groups
- helper extraction remains test-local and behavior-preserving
- focused action dispatcher tests, coverage, and full verify pass

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
