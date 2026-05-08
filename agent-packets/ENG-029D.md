<!-- agent-packet:story-id ENG-029D -->
<!-- agent-packet:story-path stories/approved/ENG-029D-integrate-simple-target-effect.yaml -->
<!-- agent-packet:story-sha256 d910b3cc733b763813ed982736ff09d9d4e34058d48498155f7aae55dc54d35c -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-029D
Epic ID: KICK-001
Title: Guard target effect primitive gap
Type: implementation
Area: engine
Primary Concern: rules

## Why

Lock in deterministic fail-closed behavior for selected-target continuation while no target-based effect primitive is currently supported.

## Authoritative Spec References

- 03-game-state-events-decisions.s013 (Targets/cards)
- 03-game-state-events-decisions.s009 (Pending decisions)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 05-effect-dsl-reference.s008 (Targets)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 11-testing-quality.s007 (Interaction tests)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 03-game-state-events-decisions.s013 (Targets/cards)

```ts
interface SelectTargetsDecision extends BaseDecision {
  type: "selectTargets";
  request: TargetRequest;
  candidates: TargetCandidate[];
}

interface SelectCardsDecision extends BaseDecision {
  type: "selectCards";
  request: CardSelectionRequest;
  candidates: CardSelectionCandidate[];
}
```

### 03-game-state-events-decisions.s009 (Pending decisions)

Effects, costs, target selection, optional activation, simultaneous trigger ordering, and life triggers all pause through the same model.

```ts
type PendingDecision =
  | ChooseTriggerOrderDecision
  | ChooseOptionalActivationDecision
  | PayCostDecision
  | SelectTargetsDecision
  | SelectCardsDecision
  | ChooseEffectOptionDecision
  | ConfirmLifeTriggerDecision
  | OrderCardsDecision
  | MulliganDecision
  | DeclareLoopCountDecision
  | RollbackConsentDecision;

interface BaseDecision {
  id: string;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
  defaultResponse?: DecisionResponse;
  visibility: EventVisibility;
}
```

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

### 03-game-state-events-decisions.s018 (Canonical event visibility)

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

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

### 05-effect-dsl-reference.s008 (Targets)

Use `TargetRequest` when a player may choose and `Target` for source-relative automatic targets.

```ts
type Target =
  | { type: "self" }
  | { type: "myLeader" }
  | { type: "opponentLeader" }
  | { type: "attacker" }
  | { type: "attackTarget" }
  | { type: "blocker" }
  | { type: "triggerCard" }
  | { type: "all"; zone: Zone; player: PlayerRef; filter?: CardFilter }
  | { type: "choose"; request: TargetRequest };

interface TargetRequest {
  timing: "onActivation" | "onResolution";
  chooser: PlayerRef;
  zone: Zone;
  player: PlayerRef;
  filter?: CardFilter;
  min: number;
  max: number;
  allowFewerIfUnavailable: boolean;
  visibility?: "public" | "privateToChooser";
}
```

### 09-card-data-and-support-policy.s010 (Card implementation record)

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";

interface CardImplementationRecord {
  cardId: CardId; // Poneglyph base card ID
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted.

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

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

Own only the unsupported target-effect continuation guard after a valid selectTargets response. The current runtime supports no target-based effect primitive, so this story must not add or choose a primitive.

## Scope

- preserve and test a deterministic fail-closed unsupported-target-effect path after target response validation
- treat KO, trash, rest, modifyPower, search, look, reveal, and replacement target effects as unsupported until later exact primitive stories approve them
- do not resolve selected targets into gameplay mutation in this story
- keep rule processing and pending runtime work handling deterministic after accepted target responses

## Out of Scope

- adding new KO, trash, rest, modifyPower, search, look, reveal, or replacement primitives
- adding target selection to unsupported timing categories
- optional activation
- custom handlers
- source-moving effects outside existing source-presence policy
- server/client/UI

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/target-selection.ts
- packages/engine-core/src/target-selection.test.ts
- packages/engine-core/src/target-selection-actions.ts
- packages/engine-core/src/target-selection-actions.test.ts
- packages/engine-core/src/effect-runtime.ts
- packages/engine-core/src/effect-runtime.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- packages/engine-core/src/filter-state-for-player.real-states.test.ts
- stories/approved/ENG-029D-integrate-simple-target-effect.yaml
- agent-packets/ENG-029D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-029D packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-029 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- if implementation requires adding or selecting a target-based primitive, optional activation, replacement effects, custom handlers, or transient search/look/reveal sets, stop and split or record the blocker
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/target-selection.test.ts packages/engine-core/src/target-selection-actions.test.ts packages/engine-core/src/effect-runtime.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/engine-core/src/filter-state-for-player.real-states.test.ts
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

- target-based effect work fails closed deterministically after validated selection without partial mutation
- unsupported target effect bodies, unsupported target requests, or unsupported timings fail closed without broadening runtime support

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
