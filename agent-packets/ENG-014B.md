<!-- agent-packet:story-id ENG-014B -->
<!-- agent-packet:story-path stories/approved/ENG-014B-block-step-choice-decline.yaml -->
<!-- agent-packet:story-sha256 ffb586d48c443a8acf51940f4930bb714ffe61f042f345b810579a3ea84569f2 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-014B
Epic ID: M1-001
Title: Open Block Step decline decision
Type: implementation
Area: engine
Primary Concern: rules

## Why

Add the supported Block Step pause and an executable defender decline/pass path using the existing `PendingDecision` / `respondToDecision` routing, so a legal blocker window never creates a stuck battle before blocker selection is implemented.

## Authoritative Spec References

- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s025 (Keyword behavior)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s009 (Pending decisions)
- 03-game-state-events-decisions.s013 (Targets/cards)
- 03-game-state-events-decisions.s015 (Legal actions)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 06-visibility-security.s007 (Legal-action visibility)
- 06-visibility-security.s017 (Filter checklist)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s019 (Block Step)

1. Defender may activate one legal `[Blocker]`, unless blocking is prohibited.
2. Blocker rests and becomes the current target.
3. Emit `blockerActivated`.
4. Queue `[On Block]` effects.
5. Resolve the block timing window.
6. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.

### 02-engine-mechanics.s020 (Counter Step)

1. Queue defender-side effects that trigger from being attacked or from the opponent's attack timing, such as `[On Your Opponent's Attack]`, before ordinary counter actions.
2. Resolve that timing window.
3. If attacker or current target left its zone or is no longer a legal battle participant, skip to End of Battle.
4. Defender may perform any number of legal counter actions:
   - Trash a Character card with counter value from hand for power.
   - Use a `[Counter]` Event by paying its cost and trashing it.
5. After each counter action and after the defender passes, re-check whether attacker and current target still exist and remain legal battle participants. If not, skip to End of Battle.
6. Proceed to Damage Step only if the attacker and current target are still legal.

The server must avoid timing leaks. If the defender has no legal counter actions and settings allow auto-pass, the window should auto-pass without revealing hidden details.

### 02-engine-mechanics.s025 (Keyword behavior)

| Keyword         | Engine behavior                                                      |
| --------------- | -------------------------------------------------------------------- |
| Rush            | Character may attack the turn it was played.                         |
| Rush: Character | Character may attack Characters, not Leader, the turn it was played. |
| Double Attack   | Leader damage count is 2.                                            |
| Banish          | Damaged life card is trashed; no normal trigger/hand path.           |
| Blocker         | During Block Step, can rest to redirect attack.                      |
| Unblockable     | Skips opponent blocker window.                                       |
| Activate: Main  | Legal only during controller's Main Phase outside battle.            |
| Main            | Event usable during controller's Main Phase.                         |
| Counter         | Event usable during opponent's Counter Step.                         |
| Once Per Turn   | Tracked by stable effect ID and card instance per turn.              |
| DON!! xX        | Condition is attached DON!! count greater than or equal to X.        |

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

### 06-visibility-security.s007 (Legal-action visibility)

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only entering/skipping Block Step, creating the defender Block Step decision, legal response filtering, and the empty-choice decline response. Stop before exposing blocker candidates, accepting a blocker selection, resting blockers, redirecting targets, resolving blocked battles, or adding Counter/On Block behavior.

## Scope

- after accepted attack declaration, enter `battle.step: "block"` when the defender has one or more would-be legal active printed Blocker Characters
- create a defender-owned Block Step `selectCards` pending decision with `min: 0`, `max: 0`, public visibility, and default empty-card response representing decline/pass
- expose only `respondToDecision` for the defending player while that Block Step decision is pending; do not expose raw `activateBlocker` actions in this story
- accept the empty-card response as defender decline, clear the pending decision, and continue the existing no-blocker supported resolution path
- continue the existing no-blocker battle resolution path immediately when the defender has no would-be legal blocker
- reject non-empty blocker selections, attacker responses, stale decision ids, pending runtime work, replacement state, and unsupported combat metadata without mutation or events until ENG-014C owns blocker selection
- preserve fail-closed behavior for Unblockable, On Block effects, Counter Step actions, replacement state, Double Attack combinations, Banish combinations that cannot use the existing no-blocker path, effect queues, and deferred triggers

## Out of Scope

- exposing blocker candidates
- accepting a blocker selection
- mutating blocker state or battle target
- resolving battle after a blocker is chosen
- supporting Unblockable, Counter, On Block, replacement, protection, or effect-runtime queueing

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/actions.ts
- packages/engine-core/src/actions.test.ts
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/action-test-fixtures.ts
- packages/engine-core/src/battle-actions-test-fixtures.ts

## Constraints

- create the ENG-014B substory branch from the approved ENG-014 parent integration branch and open the ENG-014B PR against that parent branch after human approval of the parent workflow
- do not accept blocker selection or activation mutation in this story
- legal actions and decisions must not leak hidden information
- keep engine-core deterministic and pure
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving `applyDeclareAttack` enters Block Step and creates a defender `selectCards` pending decision when defender has an active printed Blocker
- unit test proving Block Step decision creation emits public `decisionCreated` with deterministic payload, visibility, event sequence, and state hash
- unit test proving `getLegalActions` exposes the exact empty-card `respondToDecision` action to the defender during the Block Step decision and no blocker action or decision response to the attacker
- unit test proving empty `respondToDecision` declines the Block Step, emits public `decisionResolved` with deterministic sequencing, and resolves through the current supported no-blocker path
- unit test proving no legal blocker preserves current auto-resolution behavior without a pending decision
- unit tests proving rested, stale, non-Blocker, and attacker-controlled cards do not cause the Block Step decision
- unit tests proving non-empty blocker selections, pending runtime work, replacement state, Double Attack/Banish unsupported combinations, and unsupported metadata reject without mutation or events
- `corepack pnpm exec vitest run packages/engine-core/src/actions.test.ts packages/engine-core/src/battle-actions.test.ts packages/engine-core/src/compute-view.test.ts` must pass
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- attack declaration against a defender with a would-be legal blocker returns an active battle at Block Step and a defender pending decision instead of resolving damage immediately
- Block Step decision creation emits a public `decisionCreated` event with deterministic payload, visibility, sequence, and state hash
- defender legal actions include the executable empty-card `respondToDecision` response for the Block Step decision; attacker legal actions do not include that response or defender blocker actions
- defender empty response declines blocking, emits a public `decisionResolved` event with deterministic sequencing, and preserves current supported no-blocker auto-resolution behavior
- no-blocker battles continue to resolve through the existing vanilla/Banish path without opening a decision
- unsupported blocker-adjacent paths remain fail-closed without mutation

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
