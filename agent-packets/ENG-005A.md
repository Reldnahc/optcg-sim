<!-- agent-packet:story-id ENG-005A -->
<!-- agent-packet:story-path stories/approved/ENG-005A-vanilla-character-stage-play-no-overflow.yaml -->
<!-- agent-packet:story-sha256 406ca5631648f1579dd10020b4352be8254d04207dc9c076a7d68633a2d9311e -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-005A
Epic ID: M1-001
Title: Add no-overflow vanilla Character and Stage play from hand
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add `playCard` legal-action generation and application for vanilla Character and Stage cards from the turn player's hand when the destination zone has room, routing nonzero DON!! payment through canonical `PayCostDecision`.

## Authoritative Spec References

- 02-engine-mechanics.s007 (Card categories)
- 02-engine-mechanics.s014 (Main Phase)
- 02-engine-mechanics.s016 (Playing a card)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s012 (Cost payment)
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
- 18-acceptance-tests.s003 (Milestone 1 - terminal engine)
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

Own only direct no-overflow play of vanilla Character and Stage cards from hand during the turn player's Main Phase. Stop before Stage replacement, Character overflow choice, Event cards, On Play effect queueing, and cost modifier behavior.

## Scope

- include `playCard` actions in `getLegalActions` for the turn player's Main Phase Character and Stage cards in hand when no pending decision or battle is active
- use the match card manifest to identify supported `vanilla-confirmed` Character and Stage cards and their printed costs
- treat missing manifest records, unsupported support status, non-Character or non-Stage categories, and unsupported effect metadata as illegal or omitted from legal actions
- reject initial `playCard.costPayment` submissions so payment choices are not accepted outside the active decision context
- for nonzero printed costs, accepted `playCard` reveals the card and creates a single-use `PayCostDecision` for the turn player with a `restDon` option for the required count
- while the play-card `PayCostDecision` is active, `getLegalActions` exposes legal `respondToDecision` payment responses only for the decision player
- accept only the matching `respondToDecision` payment response for the active play-card cost decision and reject stale, wrong-player, wrong-decision, malformed, duplicate, wrong-player-DON!!, rested, attached, or insufficient DON!! selections without mutating input state
- after a valid payment response, rest exactly the selected active DON!! in the turn player's cost area as payment
- allow zero-cost vanilla Character and Stage cards to resolve directly from `playCard` without creating a payment decision
- move a played Character from hand to the next Character Area slot and set `turnPlayed` to the current global turn after zero-cost direct play or valid payment response
- move a played Stage from hand into the empty Stage Area after zero-cost direct play or valid payment response
- reindex the remaining hand cards after the played card leaves hand
- emit deterministic public `cardRevealed` and public `decisionCreated` events when a nonzero play-card payment decision is created
- emit deterministic public `costPaid`, public `decisionResolved`, public `cardMoved`, and public `cardPlayed` events after a valid nonzero payment response
- emit deterministic public `cardRevealed`, public `cardMoved`, and public `cardPlayed` events for accepted zero-cost play actions
- increment accepted-action state sequence once, append the event journal, run rule-processing and invariants, and return a stable state hash

## Out of Scope

- Character Area overflow when the player already controls five Characters
- Stage Area replacement when the player already controls a Stage
- `PendingDecision` creation or resolution outside the no-overflow play-card payment path
- Event card play or Event effect resolution
- On Play trigger detection or effect queueing
- continuous cost modifiers or negative-cost modifier tests beyond using the printed manifest cost
- hidden-information client legal-action projection

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/**
- tests/engine/**

## Constraints

- do not activate, packetize, or implement this story until ENG-003A and ENG-003B are done
- keep engine-core deterministic and pure
- do not introduce live Poneglyph access or a card-data package dependency into engine-core
- do not implement overflow, Stage replacement, Event cards, or On Play effects in this story
- must pass `corepack pnpm run verify`
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test for legal-action generation of payable vanilla Character and Stage cards during Main Phase
- unit test proving legal actions omit playCard for non-turn player, non-Main phase, pending decision, active battle, unsupported card, missing manifest card, and full destination zone
- unit test for accepted nonzero Character play creating a `PayCostDecision`
- unit test for legal-action generation of matching `respondToDecision` payment responses for the payment decision player
- unit test proving the wrong player does not receive payment `respondToDecision` legal actions
- unit test for valid payment response completing Character play with exact selected active DON!! payment
- unit test for accepted nonzero Stage play creating a `PayCostDecision`
- unit test for valid payment response completing Stage play with exact selected active DON!! payment
- unit test for accepted zero-cost Character play without selected DON!!
- unit test for accepted zero-cost Stage play without selected DON!!
- unit test proving accepted Character play sets `turnPlayed` and reindexes hand
- unit test asserting public `cardRevealed` and public `decisionCreated` events for accepted nonzero `playCard`
- unit test asserting public `costPaid`, public `decisionResolved`, public `cardMoved`, and public `cardPlayed` events for accepted nonzero payment response
- unit test asserting public `cardRevealed`, public `cardMoved`, and public `cardPlayed` events for accepted zero-cost play
- unit test rejecting direct initial `costPayment` without mutation
- unit test rejecting wrong-player, wrong-decision, duplicate, rested, attached, insufficient, or stale selected DON!! payment response without mutation
- unit test rejecting stale or forged card instance references without mutation

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- legal actions include no-overflow `playCard` actions only for supported vanilla Character and Stage cards in the turn player's hand during Main Phase
- non-turn players, non-Main phases, pending-decision states, active-battle states, unsupported cards, missing manifest records, and full destination zones do not receive no-overflow play actions
- accepted nonzero Character or Stage `playCard` creates a `PayCostDecision` instead of accepting direct payment selection on the initial action
- while a play-card payment decision is active, legal actions include only matching `respondToDecision` payment responses for the decision player plus concession where already allowed
- a valid payment response for Character play rests the selected active DON!!, removes the card from hand, places it in the next Character Area slot, sets `turnPlayed`, emits required events, and produces a new state hash
- a valid payment response for Stage play rests the selected active DON!!, removes the card from hand, places it in an empty Stage Area, emits required events, and produces a new state hash
- accepted zero-cost Character and Stage play resolves directly without creating a payment decision
- illegal payment responses, direct initial `costPayment`, and stale or forged card references return `illegalAction` errors without mutating the input state

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
