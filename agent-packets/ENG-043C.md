<!-- agent-packet:story-id ENG-043C -->
<!-- agent-packet:story-path stories/approved/ENG-043C-once-per-turn-failed-cost-target-regressions.yaml -->
<!-- agent-packet:story-sha256 b4707f7758d989bc0e92678143b5db0605aed1db316f7aa512ca2f63e1847157 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-043C
Epic ID: KICK-001
Title: Commit target activations and preserve failed attempts
Type: implementation
Area: engine
Primary Concern: rules

## Why

Integrate once-per-turn commitment with the existing supported activation-time target-selection continuation path, and add synthetic regressions proving failed cost payment, failed target-selection setup, and invalid target responses do not consume once-per-turn use.

## Authoritative Spec References

- 02-engine-mechanics.s042 (Once-per-turn consumption)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s042 (Once-per-turn consumption)

The engine records `[Once Per Turn]` usage in `GameState.oncePerTurn` by `cardInstanceId + effectId + turnNumber`.

Use is consumed only after the activation is legally committed:

1. Conditions required at activation have passed.
2. Required activation targets, if any, have been selected legally.
3. Required costs have been paid successfully.
4. The player has accepted an optional activation, if the effect is optional.

If a player declines an optional effect, cannot pay a cost, or cannot make a required activation-time selection, once-per-turn use is not consumed. If the effect is legally committed and later fizzles, loses its target, or does as much as possible during resolution, the once-per-turn use remains consumed.

For automatic once-per-turn effects, optional decline does not consume use; accepted automatic effects consume use when their queue entry begins resolution.

### 03-game-state-events-decisions.s017 (Canonical decision routing)

All player choices are represented as `PendingDecision` and answered by exactly one action shape:

```ts
{
  type: ("respondToDecision", decisionId, response);
}
```

The engine validates the response against the current pending decision. The client never gets to submit raw target IDs or payment choices outside the active decision context.

The following decision families are implementation-required for Milestones 1-2:

```text
mulligan
chooseTriggerOrder
chooseOptionalActivation
payCost
selectTargets
selectCards
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

### 04-effect-runtime.s011 (Conditions and costs)

Before resolving an effect block:

1. Check source presence policy.
2. Re-check condition if the effect requires condition-on-resolution.
3. Check `[Once Per Turn]` usage by `source.instanceId + effectBlock.id + turn`.
4. If activation requires cost, create a `PayCostDecision` when choices are required.
5. Pay cost atomically and emit `costPaid` events.
6. Mark once-per-turn usage only after legal commitment: activation conditions passed, required activation-time targets selected, costs paid, and optional activation accepted. Declined optional effects and failed costs do not consume use; legally committed effects that later fizzle do consume use.

```ts
interface OncePerTurnRecord {
  cardInstanceId: InstanceId;
  effectId: string;
  turnNumber: number;
  usedAtStateSeq: StateSeq;
}
```

### 04-effect-runtime.s012 (Player choices during effect resolution)

Effects pause through `PendingDecision`.

Example target selection flow:

```ts
function executeKoEffect(
  state: GameState,
  effect: KoEffect,
  context: EffectContext,
): EngineResult {
  const candidates = resolveTargetCandidates(state, effect.target, context);

  if (requiresChoice(effect.target)) {
    return pauseForDecision(state, {
      type: "selectTargets",
      playerId: resolveChooser(effect.target, context),
      request: effect.target,
      candidates,
      causedBy: context.causedBy,
    });
  }

  return koTargets(state, candidates.selected, context);
}
```

Decision responses are validated by the engine, not the client.

### 11-testing-quality.s004 (Unit tests per DSL primitive)

Every primitive has tests independent of specific cards:

- `draw`
- `ko`
- `trash`
- `bounce`
- `search`
- `lookAtTop`
- `modifyPower`
- `modifyCost`
- `giveKeyword`
- `replacement`
- `damage`
- `addLife`
- `attachDon`
- `returnDon`
- `choice`
- `conditional`
- `sequence`

Primitive tests should assert events, state, decisions, and visibility where applicable.

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

Own only once-per-turn commitment for existing supported selected-target effect continuation and failure regressions for existing payment and target-selection paths. Do not introduce new cost semantics, target shapes, client-trusted target candidates, or real-card fixture coverage.

## Scope

- allow `oncePerTurn: true` only on the existing supported selected-target effect continuation path
- consume use only after successful required activation-time target selection reaches legal commitment
- prove failed play-card cost/payment response paths do not add once-per-turn records
- prove failed activation-time target-selection creation does not add once-per-turn records
- keep invalid target decision responses mutation-free and unconsumed

## Out of Scope

- new cost primitives or cost payment semantics
- new target shapes or client-trusted target candidates
- optional activation behavior
- replacement effects
- custom handlers
- real-card fixtures or card-data integration
- server, client, API, Redis, live Poneglyph, or UI work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/once-per-turn.ts
- packages/engine-core/src/play-card.ts
- packages/engine-core/src/play-card-payment.ts
- packages/engine-core/src/effect-runtime-queue-results.ts
- packages/engine-core/src/effect-runtime-queue-target-decisions.ts
- packages/engine-core/src/target-selection-actions.ts
- packages/engine-core/src/effect-runtime-once-per-turn.test.ts
- packages/engine-core/src/play-card-event.test.ts
- packages/engine-core/src/play-card-payment.test.ts
- packages/engine-core/src/target-selection-actions.test.ts
- packages/engine-core/src/effect-runtime-queue-processing-targets.test.ts
- stories/generated/ENG-043C-once-per-turn-failed-cost-target-regressions.yaml
- stories/approved/ENG-043C-once-per-turn-failed-cost-target-regressions.yaml
- agent-packets/ENG-043C.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-043C packet while implementing this story
- run `corepack pnpm run packets:verify` before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-043 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- run `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-once-per-turn.test.ts packages/engine-core/src/play-card-payment.test.ts packages/engine-core/src/target-selection-actions.test.ts packages/engine-core/src/effect-runtime-queue-processing-targets.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- invalid or failed cost payment does not consume once-per-turn use
- failed activation-time target-selection setup does not consume once-per-turn use
- invalid target decision responses do not consume use
- a successful committed activation-time target path consumes once and cannot repeat in the same turn
- tests use synthetic engine fixtures rather than real-card fixture ingestion

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
