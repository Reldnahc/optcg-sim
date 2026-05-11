<!-- agent-packet:story-id ENG-043D -->
<!-- agent-packet:story-path stories/approved/ENG-043D-once-per-turn-optional-integration.yaml -->
<!-- agent-packet:story-sha256 aff924d60e65728e1fa81a8157dc4e500637aa5b61fa644c0acad1bc7be43aa0 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-043D
Epic ID: KICK-001
Title: Integrate optional activation commitment
Type: implementation
Area: engine
Primary Concern: rules

## Why

Integrate once-per-turn consumption with the landed optional activation path: optional decline remains unconsumed, while accepted optional automatic effects consume when their queue entry begins resolution.

## Authoritative Spec References

- 02-engine-mechanics.s042 (Once-per-turn consumption)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 04-effect-runtime.s004 (Stable effect identity)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 06-visibility-security.s017 (Filter checklist)
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

### 04-effect-runtime.s004 (Stable effect identity)

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

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

### 06-visibility-security.s017 (Filter checklist)

Before any state leaves the server:

```ts
assertNoDeckContents(view);
assertNoOpponentHandContents(view);
assertNoFaceDownLifeContents(view);
assertNoRngState(view);
assertNoEffectQueueInternals(view);
assertNoPrivateDecisionCandidates(view);
assertRevealRecordsAreRecipientFiltered(view);
assertLegalActionsDoNotLeakOpponentHiddenInfo(view);
assertSpectatorPolicyApplied(view);
```

Run these in tests for every `PlayerView` fixture.

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

Own only once-per-turn integration with the existing chooseOptionalActivation accept/decline queue path. Do not implement Optional Effects, broaden optional supported shapes, add costs, add replacement effects, or touch PlayerView/API/UI.

## Scope

- keep optional decline unconsumed and remove/skip the declined queue entry as already supported
- check once-per-turn usage before creating or resolving an optional activation if the same key was already consumed this turn
- consume accepted optional automatic effects when the accepted queue entry begins resolution
- prove accepted optional use blocks a repeated same-turn optional activation
- preserve optional decision privacy and invalid-response behavior from ENG-042

## Out of Scope

- implementing Optional Effects from scratch
- broadening optional supported effect shapes beyond ENG-042 support
- optional costs or replacement effects
- PlayerView, server, client, API, Redis, live Poneglyph, or UI work
- real-card fixtures or card-data integration

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/once-per-turn.ts
- packages/engine-core/src/optional-activation-actions.ts
- packages/engine-core/src/effect-runtime-queue-results.ts
- packages/engine-core/src/effect-runtime-primitives.ts
- packages/engine-core/src/effect-runtime-optional-activation.test.ts
- packages/engine-core/src/effect-runtime-once-per-turn.test.ts
- packages/engine-core/src/actions-pending-decision.test.ts
- packages/engine-core/src/filter-state-for-player.optional-activation.test.ts
- stories/generated/ENG-043D-once-per-turn-optional-integration.yaml
- stories/approved/ENG-043D-once-per-turn-optional-integration.yaml
- agent-packets/ENG-043D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-043D packet while implementing this story
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

- run `corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-optional-activation.test.ts packages/engine-core/src/effect-runtime-once-per-turn.test.ts packages/engine-core/src/actions-pending-decision.test.ts packages/engine-core/src/filter-state-for-player.optional-activation.test.ts`
- run `corepack pnpm --filter @optcg/engine-core typecheck`
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- optional decline does not add a once-per-turn record
- accepted optional automatic effects add one usage record when their accepted queue entry begins resolution
- same-turn repeated optional use is blocked after an accepted use
- prior-turn optional use does not block the next turn
- existing optional invalid-response and privacy regressions still pass

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
