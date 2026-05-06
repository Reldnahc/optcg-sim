<!-- agent-packet:story-id ENG-014A -->
<!-- agent-packet:story-path stories/approved/ENG-014A-computed-blocker-eligibility.yaml -->
<!-- agent-packet:story-sha256 3db52ed68dd86f0c2bdcb17e4e7c26eb714ba5a00e43c855820d04ea0b4c17bb -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-014A
Epic ID: M1-001
Title: Compute supported Blocker eligibility
Type: implementation
Area: engine
Primary Concern: rules

## Why

Teach computed combat view to carry printed Blocker metadata and compute deterministic `canBlock` eligibility during an active Block Step, while preserving fail-closed attack resolution only when a defender-side Block Step would be required before blocker choices are implemented.

## Authoritative Spec References

- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s025 (Keyword behavior)
- 03-game-state-events-decisions.s003 (Base state vs. computed view)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

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

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only computed-view Blocker eligibility and the guard that prevents existing battle resolution from silently ignoring legal defender blockers. Stop before opening Block Step decisions, exposing blocker choices, mutating blocker state, redirecting targets, or resolving blocked battles.

## Scope

- remove printed `blocker` from compute-view's unsupported combat keyword gate only for computed metadata
- compute `ComputedCardView.canBlock` as true only for an active Character controlled by the defender during an active battle Block Step when the card has printed `blocker`
- keep `canBlock` false outside battle, outside Block Step, for rested Characters, Leaders, turn-player attackers, non-Blocker Characters, stale battle states, and unsupported combat metadata
- preserve fail-closed battle behavior only when an accepted attack would require an unsupported defender Block Step because the defender has a would-be legal active printed Blocker Character
- do not reject attack declaration solely because an attacker-controlled, rested, stale, or otherwise ineligible card has printed `blocker`

## Out of Scope

- opening Block Step pending decisions
- adding `activateBlocker` legal actions
- changing `applyAction` routing
- resting blockers, setting `battle.blocker`, redirecting `battle.currentTarget`, or emitting `blockerActivated`
- supporting Unblockable, Counter, On Block effects, replacement effects, protection, or effect-runtime queueing

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/compute-view.ts
- packages/engine-core/src/compute-view.test.ts
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/action-test-fixtures.ts
- packages/engine-core/src/battle-actions-test-fixtures.ts

## Constraints

- create the ENG-014A substory branch from the approved ENG-014 parent integration branch and open the ENG-014A PR against that parent branch after human approval of the parent workflow
- do not expose or accept Block Step decisions or blocker activation in this story
- fail closed rather than silently skipping a legal defender Block Step
- keep engine-core deterministic and pure
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving active defender Character with printed `blocker` has `canBlock: true` during Block Step
- unit tests proving `canBlock: false` outside Block Step, for rested blockers, non-Blockers, Leaders, stale blockers, and attacker-controlled Blockers
- separate unit tests proving compute view still fails closed for `unblockable`, unsupported support status, and missing combat power
- unit test proving `applyDeclareAttack` with a would-be legal defender Blocker rejects without mutation or events until ENG-014B opens the Block Step decision
- unit test proving attacker-controlled or otherwise ineligible printed Blocker cards do not reject attack declaration solely because they have `blocker`
- `corepack pnpm exec vitest run packages/engine-core/src/compute-view.test.ts packages/engine-core/src/battle-actions.test.ts` must pass
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- compute view includes printed `blocker` in card keywords without throwing solely because Blocker exists
- active defender Blocker Characters report `canBlock: true` only during Block Step
- ineligible blockers report `canBlock: false` deterministically
- attack declaration does not silently ignore a would-be legal defender Blocker before the Block Step decision surface exists
- unsupported keyword and support-status guards remain fail-closed for unrelated unsupported metadata

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
