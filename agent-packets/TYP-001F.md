<!-- agent-packet:story-id TYP-001F -->
<!-- agent-packet:story-path stories/approved/TYP-001F-runtime-support-structural-contracts.yaml -->
<!-- agent-packet:story-sha256 242d5b8064877f0398dc455d978c934053af6f657e7bcfce2b17976c1e82cb65 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-001F
Epic ID: M1-001
Title: Add runtime support structural contracts
Type: implementation
Area: contracts
Primary Concern: contract

## Why

Add the canonical structural support contracts used inside state and runtime processing before the final GameState and EngineResult surfaces are exported.

## Authoritative Spec References

- 02-engine-mechanics.s006 (Zone transition rules)
- 02-engine-mechanics.s033 (Infinite loops)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s019 (Deterministic RNG)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s008 (Trigger detection from events)
- 04-effect-runtime.s009 (Queue ordering)
- 04-effect-runtime.s011 (Conditions and costs)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 04-effect-runtime.s013 (Replacement effects)
- 04-effect-runtime.s014 (Continuous effects as computed view)
- 04-effect-runtime.s017 (Transient reveal and selection sets)
- 07-match-server-protocol.s006 (Broadcast messages)
- 07-match-server-protocol.s013 (Timers)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)

## Relevant Spec Excerpts

### 02-engine-mechanics.s006 (Zone transition rules)

When a card moves from field to another zone, it becomes a new card instance. Applied effects are stripped. Instance identity must reset when appropriate.

```ts
interface CardInstance {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  turnPlayed?: number;
  attachedDon?: InstanceId[];
}
```

When multiple cards are placed into a zone simultaneously, the owner chooses their order. If the destination is secret, the opponent must not see the chosen order unless the game rules explicitly reveal it.

When a card with attached DON!! leaves the field, attached DON!! return to the owner's cost area rested.

### 02-engine-mechanics.s033 (Infinite loops)

The engine must detect repeated state/action/effect signatures.

```ts
interface LoopSignature {
  stateHash: string;
  pendingQueueHash: string;
  decisionHash?: string;
}
```

If neither player can stop the loop, the match is a draw. If one or both can stop it, the relevant player(s) declare a loop count according to rules, the engine executes the selected count, then stops at the break point. A loop may not be restarted from an identical state.

### 03-game-state-events-decisions.s002 (Canonical state model)

The canonical `GameState` is server-only. It includes hidden information, RNG state, internal queues, snapshots, and metadata.

**v6 contract:** the compile-ready version of every interface in this document is [`contracts/canonical-types.ts`](contracts/canonical-types.ts). Markdown snippets below are explanatory and may be abbreviated. If a snippet conflicts with the contract file, the contract file wins.

Canonical naming decisions:

| Concept                | Canonical name             |
| ---------------------- | -------------------------- |
| State sequence         | `stateSeq`                 |
| Event collection       | `eventJournal`             |
| Battle sub-state       | `battle`                   |
| Effect queue           | `effectQueue`              |
| Continuous modifiers   | `continuousEffects`        |
| Decision answer action | `Action.respondToDecision` |
| Hidden/server-only RNG | `rng`                      |

Do not use `eventLog`, `activeBattle`, raw JavaScript `Set`, or transport envelopes inside canonical state. Serializable arrays are required for deterministic hashing.

```ts
type PlayerId = string & { __brand: "PlayerId" };
type CardId = string & { __brand: "CardId" };
type InstanceId = string & { __brand: "InstanceId" };
type MatchId = string & { __brand: "MatchId" };
type EngineEventId = string & { __brand: "EngineEventId" };

interface GameState {
  matchId: MatchId;
  status: MatchStatus;
  version: RuntimeVersionSet;
  seq: StateSeq;
  actionSeq: number;
  turn: TurnState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}
```

Canonical live state also carries the authoritative per-player timer snapshot used for `PlayerView` and reconnect/state-sync payloads. Do not fabricate timer values in filtered views.

The browser does not receive this object.

### 03-game-state-events-decisions.s003 (Base state vs. computed view)

Separate base facts from derived values.

Base state stores:

- Which cards are in which zones.
- Active/rested state.
- Attached DON!! cards.
- Turn, phase, battle sub-step.
- Effect durations and source references.
- Pending decisions.

Computed view derives:

- Current power.
- Current cost.
- Granted/removed keywords.
- Attack/block restrictions.
- Protection from K.O. or other processes.
- Replacement candidates.

```ts
interface ComputedGameView {
  seq: StateSeq;
  turnPlayerId: PlayerId;
  cards: Record<InstanceId, ComputedCardView>;
  legalAttackTargets: Record<InstanceId, InstanceId[]>;
  restrictions: RestrictionIndex;
}

interface ComputedCardView {
  instanceId: InstanceId;
  cardId: CardId;
  basePower?: number;
  currentPower?: number;
  baseCost?: number;
  currentCost?: number;
  keywords: Keyword[];
  canAttack: boolean;
  canBlock: boolean;
  cannotBeAttacked: boolean;
  protectedFrom: Protection[];
}
```

Do not persist derived current power as canonical state unless a rule explicitly changes a base value. Recompute from base state and continuous modifiers.

### 03-game-state-events-decisions.s019 (Deterministic RNG)

The engine must never use `Math.random()`.

```ts
interface RngState {
  algorithm: "pcg32" | "xoshiro256ss" | "test-fixed";
  seedCommitment?: string;
  internalState: string;
  callCount: number;
}

interface RngDrawResult<T> {
  value: T;
  nextRng: RngState;
  event: EngineEvent;
}
```

All shuffle operations emit an event without exposing the resulting order to players.

### 03-game-state-events-decisions.s021 (Invariant hooks)

Run invariants after every accepted action and after every effect resolution in tests/dev.

Required invariants:

```ts
assertAllCardsInExactlyOneLocation(state);
assertNoDuplicateInstanceIds(state);
assertZoneOwnershipIsValid(state);
assertAttachedDonExistsAndBelongsToController(state);
assertCharacterAreaSizeAtMostFive(state);
assertStageAreaSizeAtMostOne(state);
assertLeaderAreaExactlyOne(state);
assertNoNegativeZoneCounts(state);
assertPendingDecisionHasLegalResponses(state);
assertEffectQueueEntriesHaveValidSourcesOrPolicies(state);
assertHiddenInfoNotPresentInPlayerViews(state);
```

### 03-game-state-events-decisions.s022 (Internal state sequencing)

```ts
type StateSeq = number & { __brand: "StateSeq" };

interface TurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}
```

Increment `state.seq` after every accepted action or resolved decision, not after every internal event. Internal events have their own sequence inside the event journal.

### 04-effect-runtime.s006 (Effect queue entry)

```ts
interface EffectQueueEntry {
  id: QueueEntryId;
  state: "pending" | "resolving" | "resolved" | "cancelled";
  timingWindowId: TimingWindowId;
  generation: number;
  controllerId: PlayerId;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  triggerEventId?: EngineEventId;
  effectBlockId: EffectId;
  orderingGroup: "turnPlayer" | "nonTurnPlayer";
  createdAtEventSeq: number;
  queuedAtStateSeq: StateSeq;
  sourcePresencePolicy: SourcePresencePolicy;
  causedBy: CausalityRef;
}
```

### 04-effect-runtime.s008 (Trigger detection from events)

Trigger detection consumes event batches.

```ts
function detectTriggeredEffects(
  state: GameState,
  events: EngineEvent[],
): TriggerCandidate[] {
  const candidates: TriggerCandidate[] = [];

  for (const event of events) {
    candidates.push(...findAutoEffectsForEvent(state, event));
    candidates.push(...findReplacementFollowupsIfAny(state, event));
  }

  return candidates.filter((c) => canTriggerNow(c, state));
}
```

The engine must check source presence before queueing, then apply the queue entry's source-presence policy before resolution.

### 04-effect-runtime.s009 (Queue ordering)

Every trigger collection creates or joins a timing window. Queue order is deterministic and must not depend on JavaScript array discovery order except where the spec explicitly says discovery order is the canonical tie-breaker.

Normative ordering algorithm:

```text
1. Assign every collected trigger a timingWindowId.
2. Assign generation = 0 for effects triggered by the original timing event.
3. When resolving an effect produces new triggers, enqueue them with generation = currentGeneration + 1 in the same timing window unless a new official timing window has opened.
4. Resolve older timing windows before newer timing windows.
5. Within a timing window, resolve lower generation before higher generation.
6. Within a generation, resolve turn-player bucket before non-turn-player bucket.
7. Within a player's bucket, if more than one effect is pending, create chooseTriggerOrder for that player.
8. If no choice is required, use stable tie-breakers: createdAtEventSeq, then source instance id, then effect id.
```

Consequences:

- If turn player effect A and non-turn player effect B are pending, and A creates turn player effect C while resolving, B resolves before C.
- Effects triggered during damage processing wait until all damage points are complete, except `[Trigger]` resolution itself.
- Effects triggered during an effect or card activation wait until the triggering process completes.
- Optional triggered effects create `chooseOptionalActivation` decisions at the point they would enter or begin resolution, according to the card's timing rule.

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

### 04-effect-runtime.s013 (Replacement effects)

Replacement effects intercept replaceable processes.

```ts
interface ReplacementProcess {
  id: string;
  type: ReplaceableProcessType;
  source?: CardRef;
  target?: CardRef;
  payload: unknown;
  causedBy: CausalityRef;
  usedReplacementIds: string[];
}
```

Processing order:

1. Replacements generated by the card/process being replaced, if applicable.
2. Turn player's applicable replacements in chosen order.
3. Non-turn player's applicable replacements in chosen order.

A replacement cannot apply twice to the same replacement process. If a replacement cannot actually perform its replacement, it does not apply.

```ts
function executeReplaceableProcess(
  state: GameState,
  process: ReplacementProcess,
): EngineStepResult {
  let current = process;
  let currentState = state;

  while (true) {
    const replacements = findApplicableReplacements(currentState, current)
      .filter((r) => !current.usedReplacementIds.includes(r.id))
      .filter((r) => canApplyReplacement(r, currentState, current));

    if (replacements.length === 0) {
      return executeUnreplacedProcess(currentState, current);
    }

    const choice = chooseReplacementByPriorityOrDecision(
      currentState,
      replacements,
      current,
    );

    if (choice.pausedForDecision) {
      return choice.result;
    }

    if (!choice.chosen) {
      return executeUnreplacedProcess(currentState, current);
    }

    current = {
      ...transformProcessByReplacement(choice.chosen, currentState, current),
      usedReplacementIds: [...current.usedReplacementIds, choice.chosen.id],
    };

    currentState = emitReplacementApplied(
      currentState,
      choice.chosen,
      current,
    ).state;
  }
}
```

Replacement decisions use `PendingDecision.chooseReplacement`. Optional replacements may be declined; mandatory replacements cannot be declined unless more than one mandatory replacement requires a controller-chosen order. A replacement cannot apply twice to the same `process.id`, even if the process is transformed into a new shape.

Every applied replacement emits `replacementApplied` with the original process ID, selected replacement ID, old process payload hash, and transformed process payload hash. This event is at least `replayOnly` and may be public when the replacement effect is public.

### 04-effect-runtime.s014 (Continuous effects as computed view)

Continuous and permanent effects do not mutate canonical state on every recalculation. They generate modifiers, and a computed view applies them.

```ts
interface ContinuousEffectRecord {
  id: string;
  source: CardRef;
  sourceSnapshot: CardSnapshot;
  controller: PlayerId;
  modifier: Modifier;
  duration: Duration;
  condition?: Condition;
  createdBy: CausalityRef;
  createdAtStateSeq: StateSeq;
}

interface Modifier {
  layer: ModifierLayer;
  target: TargetSpec;
  operation: ModifierOperation;
}

type ModifierLayer =
  | "basePowerSet"
  | "baseCostSet"
  | "powerAdd"
  | "costAdd"
  | "keywordAdd"
  | "keywordRemove"
  | "restriction"
  | "protection";
```

Computing a view:

```ts
function computeView(state: GameState): ComputedGameView {
  const base = buildBaseView(state);
  const activeModifiers = collectActiveContinuousEffects(state);
  return applyModifierLayers(base, activeModifiers, state.turn.turnPlayerId);
}
```

Permanent effects may depend on the computed state. If the official rule requires fixed-point behavior, implement the fixed-point over computed views, not by writing current power/cost into canonical state.

### 04-effect-runtime.s017 (Transient reveal and selection sets)

Transient sets are part of effect execution context, not normal zones. They exist for patterns such as revealing the top card, selecting from a revealed set, and returning unselected cards face-down.

Rules:

1. A transient set has an origin, visibility, and cleanup policy.
2. Cards in a transient set are not simultaneously in hand/deck/trash/life.
3. Movement from a transient set to a real zone must emit a `cardMoved` event with appropriate visibility.
4. If an effect exits early, cleanup policy runs before the queue continues.
5. Opponent views may see a revealed card only for the duration and visibility specified by the effect. If the card returns face-down to a hidden zone, future opponent views must not retain its ID.

### 07-match-server-protocol.s006 (Broadcast messages)

```ts
type ServerMessage =
  | ServerActionResult
  | {
      type: "stateSync";
      matchId: MatchId;
      serverSeq: number;
      stateSeq: number;
      view: PlayerView;
    }
  | {
      type: "decisionRequired";
      matchId: MatchId;
      serverSeq: number;
      stateSeq: number;
      decision: PublicDecision;
    }
  | {
      type: "timerUpdate";
      matchId: MatchId;
      serverSeq: number;
      stateSeq: number;
      timers: PublicTimerState;
    }
  | {
      type: "opponentDisconnected";
      matchId: MatchId;
      serverSeq: number;
      timeoutAt: string;
    }
  | { type: "opponentReconnected"; matchId: MatchId; serverSeq: number }
  | {
      type: "matchError";
      matchId: MatchId;
      serverSeq: number;
      message: string;
      reportToken: string;
    }
  | {
      type: "matchEnded";
      matchId: MatchId;
      serverSeq: number;
      stateSeq: number;
      result: MatchResult;
    }
  | { type: "ping"; serverTime: string }
  | { type: "pong"; serverTime: string };
```

Messages are per-recipient filtered. Two players may receive different payloads for the same state sequence. Every non-heartbeat server message has a monotonically increasing `serverSeq` per recipient connection and includes `stateSeq` when tied to game state. Clients discard messages older than their latest accepted `serverSeq` or `stateSeq`.

### 07-match-server-protocol.s013 (Timers)

Use one primary game timer per player plus a disconnect grace timer. Do **not** create a separate mulligan timer or decision timer.

The rule is simple:

- the timer only drains for the player currently holding up progress
- if the engine is resolving mandatory work, no player timer drains
- if neither player is currently holding up the game, no player timer drains
- if a player's game timer reaches 0, that player loses immediately

Mulligan example:

- if neither player has chosen keep/mulligan yet, neither timer drains
- once one player has chosen, the other player is now holding up setup, so only that player's timer drains

```ts
interface PlayerGameTimer {
  playerId: PlayerId;
  remainingMs: number;
  isRunning: boolean;
}

interface TimerState {
  drainingPlayerId?: PlayerId;
  players: Record<PlayerId, PlayerGameTimer>;
  disconnect?: {
    playerId: PlayerId;
    startedAt: string;
    expiresAt: string;
  };
}
```

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

## Story Boundary

Own only runtime support structures such as timers, RNG, card instances, player state, turn/battle state, audit/reveal records, once-per-turn records, replacement/deferred trigger state, effect queue entries, execution contexts, continuous effects, loop signatures, and computed views. Do not export GameState, EngineResult, actions, decisions, public view DTOs, custom handlers, or engine behavior.

## Scope

- export canonical timer contracts: `PlayerGameTimer`, `TimerState`, and `PublicTimerState`
- export canonical RNG, card, player, match, battle, and turn support contracts: `RngState`, `RngDrawResult`, `CardInstance`, `LifeCard`, `PlayerState`, `Winner`, `MatchStatus`, `BattleState`, and `TurnState`
- export canonical audit, loop, reveal, replacement, trigger, and transient set contracts: `AuditEntry`, `LoopSignature`, `RevealRecord`, `ReplacementProcessState`, `ReplaceableProcessType`, `ReplacementProcess`, `TriggerCandidate`, `TransientCardSet`, and `DeferredTriggerBucket`
- export canonical protection, restriction, computed-view, queue, execution-context, target-spec, modifier, and continuous-effect contracts: `Protection`, `RestrictionIndex`, `ComputedCardView`, `ComputedGameView`, `OncePerTurnRecord`, `EffectQueueEntry`, `EffectExecutionContext`, `EffectContext`, `TargetSpec`, `ModifierLayer`, `ModifierOperation`, `Modifier`, `ContinuousEffectRecord`, and `ContinuousEffect`
- ensure server-only runtime structures can represent hidden zones and internal queues without exposing public DTOs
- ensure `PublicTimerState` is the only public-shaped support contract introduced by this slice
- add package-local type tests for representative runtime support fixtures

## Out of Scope

- `GameState`, `EngineResult`, `EngineStepResult`, `EngineError`, `StateHashInput`, or `AtomicMutation`
- action and pending-decision unions
- effect definition/filter contracts owned by TYP-001D
- decision/action support contracts owned by TYP-001E
- `CustomHandler`
- player or spectator view DTOs
- `PublicDecision`, `PublicLegalAction`, filtered legal-action projections, or hidden-info filtering DTOs

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/types/src/**

## Constraints

- canonical runtime support structures may include hidden information
- do not add filtering behavior in this contract story
- must pass `corepack pnpm run verify`

## Required Tests

- package type test compiling representative timer and RNG state fixtures
- package type test compiling representative player, zone, card-instance, turn, and battle state fixtures
- package type test compiling representative effect queue, execution context, modifier, and continuous effect records
- package negative type tests proving raw JavaScript `Set` is rejected where canonical structures require arrays or records, especially `CardInstance.attachedDon`, `TransientCardSet.cards`, `EffectExecutionContext.transientSets`, `EffectExecutionContext.selections`, `ComputedGameView.cards`, `ComputedGameView.legalAttackTargets`, `RestrictionIndex`, and timer/player records
- package compile test proving this slice does not add, redeclare, or modify TYP-001E-owned action/decision exports
- package compile test proving `GameState`, `EngineStepResult`, `EngineResult`, `EngineError`, `StateHashInput`, `AtomicMutation`, `CustomHandler`, `PlayerView`, `SpectatorView`, `PublicDecision`, `PublicLegalAction`, and related public projection DTOs are not introduced by this slice

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- runtime support contracts use serializable arrays and records rather than raw JavaScript `Set`
- hidden-zone and server-only internals are represented only in canonical/runtime structures, not public DTOs
- support structures are available for the later GameState contract without circular story dependencies
- this story does not export `GameState`, result/hash/error contracts, `CustomHandler`, or player/spectator view DTOs
- this story does not redeclare or modify action/decision contracts owned by TYP-001E
- public-shaped output remains limited to `PublicTimerState` and does not introduce player/spectator/public decision or public legal-action projections

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
