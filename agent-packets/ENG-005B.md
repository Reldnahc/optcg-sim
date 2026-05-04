<!-- agent-packet:story-id ENG-005B -->
<!-- agent-packet:story-path stories/approved/ENG-005B-vanilla-play-replacement-and-overflow.yaml -->
<!-- agent-packet:story-sha256 675ed74525e91e1376d1de5142c50b413b6aee52788201d72da22d3156333bf1 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-005B
Epic ID: M1-001
Title: Add vanilla Stage replacement and Character overflow play
Type: implementation
Area: engine
Primary Concern: rules

## Why

Extend vanilla `playCard` from hand to handle occupied Stage Area replacement and full Character Area overflow using the canonical card-selection decision response path.

## Authoritative Spec References

- 02-engine-mechanics.s007 (Card categories)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s016 (Playing a card)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s012 (Cost payment)
- 03-game-state-events-decisions.s013 (Targets/cards)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 11-testing-quality.s004 (Unit tests per DSL primitive)
- 11-testing-quality.s008 (Invariant tests)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s007 (Card categories)

| Category  | Field zone               | Has power | Has cost |   Has life |                             Can attack |
| --------- | ------------------------ | --------: | -------: | ---------: | -------------------------------------: |
| Leader    | Leader Area              |       Yes |       No | Setup only |                                    Yes |
| Character | Character Area           |       Yes |      Yes |         No | Yes, subject to turn-played/Rush rules |
| Event     | None after use           |        No |      Yes |         No |                                     No |
| Stage     | Stage Area               |        No |      Yes |         No |                                     No |
| DON!!     | Cost/attached/DON!! deck |        No |       No |         No |                                     No |

### 02-engine-mechanics.s014 (Main Phase)

Before the turn player receives action priority, emit `phaseStarted(main)`, collect `[Start of Main Phase]` triggers, and resolve required automatic effects. If any pending decision is created, Main Phase action priority does not begin until that decision and the resulting queue are complete.

Turn player may repeatedly:

- Play a Character, Stage, or `[Main]` Event from hand.
- Activate `[Activate: Main]` effects.
- Give active DON!! to Leader or Characters.
- Declare an attack, if legal.
- End the phase.

Neither player can attack on their first turn.

### 02-engine-mechanics.s016 (Playing a card)

Playing a card from hand is a structured action:

```text
1. Reveal card from hand.
2. Compute total cost from base cost plus continuous cost modifiers.
3. Clamp final negative cost to 0.
4. Select required active DON!! in cost area.
5. Rest selected DON!!.
6. If playing a Character while character area is full, choose and trash one existing Character by rule process; no triggers.
7. If playing a Stage while stage area is full, trash existing Stage.
8. Place card in destination or trash Event before resolving Event effect.
9. Emit cardPlayed/cardMoved events.
10. Detect and queue [On Play] or Event effects as appropriate.
```

Cost payment should be represented as a `PendingDecision` if the player must choose exactly which DON!! or additional cards to pay.

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

### 02-engine-mechanics.s038 (Rule-process trashing is not effect trashing)

Two common rule processes do not generate normal K.O./trash triggers:

- Playing a sixth Character requires trashing one existing Character before the new Character is played.
- Playing a new Stage trashes the existing Stage first.

These are rule processes, not card effects. Do not emit ordinary K.O./trash triggers unless official rulings require a specific exception.

### 03-game-state-events-decisions.s004 (Engine result)

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

### 03-game-state-events-decisions.s005 (Event journal)

Every atomic mutation emits events. Trigger detection consumes events, not actions.

Event sequencing is part of the replay and state-hash contract:

- EngineResult.events from one accepted transition must be strictly increasing by
  `seq`.
- The final `state.eventJournal` must be strictly increasing by `seq`.
- Event `seq` values must be allocated by append order.
- Helpers must not create multiple events in one `push` call when event IDs or seq values depend on `events.length`; append events one at a time or use an
  equivalent allocator that observes the already-appended event count.

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

### 03-game-state-events-decisions.s012 (Cost payment)

```ts
interface PayCostDecision extends BaseDecision {
  type: "payCost";
  cost: Cost;
  paymentOptions: PaymentOption[];
}
```

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

### 03-game-state-events-decisions.s016 (Action envelope inside the engine)

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

### 03-game-state-events-decisions.s023 (Error handling inside the engine)

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

### 09-card-data-and-support-policy.s013 (Match-time card manifest)

At match creation, snapshot resolved card data versions and implementation data. Replays use this manifest instead of live Poneglyph data. The implementation contract is `MatchCardManifest` in `contracts/canonical-types.ts`.

```ts
interface MatchCardManifest {
  manifestHash: string;
  source: "poneglyph" | "poneglyph-fixture" | "manual-test";
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  banlistVersion: string;
  cards: Record<CardId, ResolvedCard>;
  createdAt: string;
}
```

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
- `PlayerView` and initial live-filtered `SpectatorView`
- public live-view DTO support contracts
- spectator-safe public-only reveal and event DTOs
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
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

Own only the destination-conflict behavior for already-payable vanilla Stage and Character play from hand. Stop before Event cards, On Play effect queueing, full effect runtime decisions, and client prompt projection.

## Scope

- build on ENG-005A payment-decision and play validation for vanilla Character and Stage cards
- allow legal `playCard` actions for vanilla Stage cards when the turn player already controls a Stage
- preserve ENG-005A payment routing first for nonzero-cost occupied-Stage replacement
- after zero-cost occupied-Stage play or a valid occupied-Stage payment response, trash the existing Stage by rule process before placing the new Stage, without K.O. handling or trigger queueing
- fail closed if an occupied Stage replacement path encounters invalid attached-DON!! state rather than inventing Stage attachment behavior
- allow legal `playCard` actions for vanilla Character cards when the turn player already controls five Characters
- preserve ENG-005A payment routing first for nonzero-cost full-area Character play
- when a zero-cost full-area Character play or valid payment response reaches the overflow point, create a `SelectCardsDecision` for the turn player to choose exactly one controlled Character to trash for overflow
- while the overflow `SelectCardsDecision` is active, `getLegalActions` exposes legal `respondToDecision` card-selection responses only for the decision player
- accept only the matching `respondToDecision` card-selection response for the active overflow decision and reject stale, wrong-player, wrong-decision, wrong-card, or multi-card responses without mutating input state
- after a valid overflow response, trash the selected existing Character by rule process with no K.O. handling or trigger queueing, return its attached DON!! rested, then place the newly played Character
- preserve deterministic payment, card movement, decision emission/resolution, event journal ordering, invariant checks, and state hashing across the play action, any payment response, and the overflow response

## Out of Scope

- changing the canonical decision contract or adding a new `chooseCharacterToTrashForOverflow` decision type
- Event card play or Event effect resolution
- On Play trigger detection or effect queueing
- K.O. triggers, replacement effects, or any trigger generated by rule-process trashing
- client prompt DTOs or hidden-information legal-action projection
- generalized `respondToDecision` support for non-overflow decisions

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-005A is done
- use canonical `SelectCardsDecision` and `respondToDecision`; do not add stale non-canonical decision families
- keep engine-core deterministic and pure
- do not implement Event cards or On Play effects in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for legal-action generation of payable Stage play while the turn player already controls a Stage
- unit test for legal-action generation of payable Character play while the turn player already controls exactly five Characters
- unit test for zero-cost Stage replacement trashing the old Stage before the new Stage is placed
- unit test for nonzero occupied-Stage play creating `PayCostDecision` before trashing the old Stage
- unit test for valid occupied-Stage payment response resting DON!! and replacing the Stage
- unit test for invalid occupied-Stage payment response leaving the old Stage untouched without mutation
- unit test proving Stage replacement reindexes trash and emits deterministic `cardMoved`, `cardTrashed`, and `cardPlayed` events
- unit test for Character overflow creating a `SelectCardsDecision` with exactly five controlled Character candidates
- unit test for nonzero-cost Character overflow creating `PayCostDecision` first and `SelectCardsDecision` after a valid payment response
- unit test for legal-action generation of matching `respondToDecision` card-selection responses for the overflow decision player
- unit test proving the wrong player does not receive overflow `respondToDecision` legal actions
- unit test for valid overflow response trashing the selected Character and placing the newly played Character
- unit test proving attached DON!! on a trashed overflow Character returns to cost area rested
- unit test proving overflow rule-process trashing does not emit `cardKOd`
- unit test rejecting stale, wrong-player, wrong-decision, wrong-card, and multi-card overflow responses without mutation

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- legal actions include `playCard` for payable vanilla Stage cards when the turn player already controls a Stage
- legal actions include `playCard` for payable vanilla Character cards when the turn player already controls exactly five Characters
- playing a zero-cost Stage while one is already in the Stage Area trashes the old Stage first, then places the new Stage and emits deterministic movement/play events
- playing a nonzero-cost Stage while one is already in the Stage Area creates `PayCostDecision` first, leaves the old Stage untouched until valid payment, then rests DON!! and replaces the Stage after valid payment
- playing a zero-cost Character while five Characters are present creates a single-use `SelectCardsDecision` that contains only the turn player's existing Characters as candidates
- a valid payment response for a nonzero Character while five Characters are present creates a single-use `SelectCardsDecision` after payment is committed
- while an overflow decision is active, legal actions include only the matching `respondToDecision` choices for the decision player plus concession where already allowed
- a valid overflow response trashes exactly the selected existing Character by rule process, returns attached DON!! rested, places the newly played Character, clears the decision, appends events, and produces a new state hash
- wrong-player, stale, invalid, missing, or multi-card overflow responses return `illegalAction` without mutating the input state
- rule-process Stage and Character trashing does not emit K.O. events or queue unsupported triggers

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
