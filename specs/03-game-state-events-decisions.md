---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "03-game-state-events-decisions"
doc_title: "Game State Events Decisions"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Game State, Events, and Decisions

<!-- SECTION_REF: 03-game-state-events-decisions.s001 -->

Section Ref: `03-game-state-events-decisions.s001`

## Canonical state model

<!-- SECTION_REF: 03-game-state-events-decisions.s002 -->

Section Ref: `03-game-state-events-decisions.s002`

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

## Base state vs. computed view

<!-- SECTION_REF: 03-game-state-events-decisions.s003 -->

Section Ref: `03-game-state-events-decisions.s003`

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

## Engine result

<!-- SECTION_REF: 03-game-state-events-decisions.s004 -->

Section Ref: `03-game-state-events-decisions.s004`

Every engine call returns a result object rather than only the new state.

```ts
interface EngineResult {
  state: GameState;
  events: EngineEvent[];
  decisions?: PendingDecision[];
  errors?: EngineError[];
  stateHash: string;
}
```

For normal play there should be at most one active `pendingDecision` at a time. Tests may use arrays to inspect internal generated decisions.

## Event journal

<!-- SECTION_REF: 03-game-state-events-decisions.s005 -->

Section Ref: `03-game-state-events-decisions.s005`

Every atomic mutation emits events. Trigger detection consumes events, not actions.

```ts
interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";
```

### Event visibility

<!-- SECTION_REF: 03-game-state-events-decisions.s006 -->

Section Ref: `03-game-state-events-decisions.s006`

Events may contain hidden data. Filter them before sending to clients.

```ts
type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" };
```

## Atomic mutation contract

<!-- SECTION_REF: 03-game-state-events-decisions.s007 -->

Section Ref: `03-game-state-events-decisions.s007`

Every primitive state mutation uses the same return shape.

```ts
interface EngineStepResult {
  state: GameState;
  events: EngineEvent[];
}

type AtomicMutation = (state: GameState) => EngineStepResult;
```

The engine should not mutate state in place in production logic. Dev/test may use deep-freeze to catch accidental mutation.

## Causality

<!-- SECTION_REF: 03-game-state-events-decisions.s008 -->

Section Ref: `03-game-state-events-decisions.s008`

Use causality references to make replays and debugging readable.

```ts
type CausalityRef =
  | { type: "playerAction"; actionId: string }
  | { type: "effect"; queueEntryId: string; effectId: string }
  | { type: "ruleProcess"; name: string }
  | { type: "replacement"; replacementId: string }
  | { type: "decision"; decisionId: string };
```

## Pending decisions

<!-- SECTION_REF: 03-game-state-events-decisions.s009 -->

Section Ref: `03-game-state-events-decisions.s009`

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

### Trigger order

<!-- SECTION_REF: 03-game-state-events-decisions.s010 -->

Section Ref: `03-game-state-events-decisions.s010`

```ts
interface ChooseTriggerOrderDecision extends BaseDecision {
  type: "chooseTriggerOrder";
  triggerIds: string[];
  constraints: {
    mustUseAll: true;
  };
}
```

### Optional activation

<!-- SECTION_REF: 03-game-state-events-decisions.s011 -->

Section Ref: `03-game-state-events-decisions.s011`

```ts
interface ChooseOptionalActivationDecision extends BaseDecision {
  type: "chooseOptionalActivation";
  effectId: string;
  source: CardRef;
  options: ["activate", "decline"];
}
```

### Cost payment

<!-- SECTION_REF: 03-game-state-events-decisions.s012 -->

Section Ref: `03-game-state-events-decisions.s012`

```ts
interface PayCostDecision extends BaseDecision {
  type: "payCost";
  cost: Cost;
  paymentOptions: PaymentOption[];
}
```

### Targets/cards

<!-- SECTION_REF: 03-game-state-events-decisions.s013 -->

Section Ref: `03-game-state-events-decisions.s013`

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

### Life trigger

<!-- SECTION_REF: 03-game-state-events-decisions.s014 -->

Section Ref: `03-game-state-events-decisions.s014`

```ts
interface ConfirmLifeTriggerDecision extends BaseDecision {
  type: "confirmLifeTrigger";
  card: CardRef;
  options: ["activateTrigger", "addToHand"];
}
```

## Legal actions

<!-- SECTION_REF: 03-game-state-events-decisions.s015 -->

Section Ref: `03-game-state-events-decisions.s015`

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

## Action envelope inside the engine

<!-- SECTION_REF: 03-game-state-events-decisions.s016 -->

Section Ref: `03-game-state-events-decisions.s016`

The server-facing protocol envelope is defined separately. The engine action should be pure data.

```ts
type Action =
  | { type: "playCard"; cardInstanceId: InstanceId; costPayment?: PaymentSpec }
  | {
      type: "activateEffect";
      source: CardRef;
      effectId: string;
      costPayment?: PaymentSpec;
    }
  | { type: "attachDon"; donInstanceId: InstanceId; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; cardInstanceId: InstanceId; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | {
      type: "respondToDecision";
      decisionId: string;
      response: DecisionResponse;
    };
```

## Canonical decision routing

<!-- SECTION_REF: 03-game-state-events-decisions.s017 -->

Section Ref: `03-game-state-events-decisions.s017`

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

## Canonical event visibility

<!-- SECTION_REF: 03-game-state-events-decisions.s018 -->

Section Ref: `03-game-state-events-decisions.s018`

Each `EngineEvent` has one visibility policy:

```text
public          safe for both players immediately
private         visible only to listed player IDs
replayOnly      hidden during live play but available in completed full replay
serverOnly      never leaves trusted server/runtime logs
```

Visibility is independent of replay determinism. Replay artifacts may store information that was never sent to either player during the live match.

## Deterministic RNG

<!-- SECTION_REF: 03-game-state-events-decisions.s019 -->

Section Ref: `03-game-state-events-decisions.s019`

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

## State hashing

<!-- SECTION_REF: 03-game-state-events-decisions.s020 -->

Section Ref: `03-game-state-events-decisions.s020`

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

## Invariant hooks

<!-- SECTION_REF: 03-game-state-events-decisions.s021 -->

Section Ref: `03-game-state-events-decisions.s021`

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

## Internal state sequencing

<!-- SECTION_REF: 03-game-state-events-decisions.s022 -->

Section Ref: `03-game-state-events-decisions.s022`

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

## Error handling inside the engine

<!-- SECTION_REF: 03-game-state-events-decisions.s023 -->

Section Ref: `03-game-state-events-decisions.s023`

Engine errors are classified.

```ts
type EngineError =
  | { type: "illegalAction"; reason: string }
  | { type: "invalidDecisionResponse"; reason: string }
  | { type: "invariantViolation"; invariant: string; details: unknown }
  | { type: "unsupportedCard"; cardId: CardId; status: CardSupportStatus }
  | { type: "effectRuntimeError"; effectId: string; details: unknown }
  | { type: "loopDetected"; signature: LoopSignature };
```

Illegal player actions are rejected and logged. Invariant violations and effect runtime errors freeze or recover the match according to the recovery policy.

## Account-level saved loadouts

<!-- SECTION_REF: 03-game-state-events-decisions.s024 -->

Section Ref: `03-game-state-events-decisions.s024`

Persist player deck choices as an account-level `Loadout`, not a browser-local saved deck. A loadout contains the gameplay decklist plus cosmetic selections:

- decklist
- DON!! deck selection
- sleeves
- playmat
- icon
- cosmetic variant selections when image assets are available

All cosmetics are globally unlocked. Ownership/inventory is out of scope for this simulator.
