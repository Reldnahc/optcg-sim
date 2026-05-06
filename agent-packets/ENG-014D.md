<!-- agent-packet:story-id ENG-014D -->
<!-- agent-packet:story-path stories/approved/ENG-014D-blocked-battle-resolution.yaml -->
<!-- agent-packet:story-sha256 8f21a0d6cf84a8fd07ae56b1b8622b9847ae8c4c2b21363068c25fbbe618bb48 -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-014D
Epic ID: M1-001
Title: Resolve supported blocked battles
Type: implementation
Area: engine
Primary Concern: rules

## Why

Complete the supported Blocker vertical by resolving battles after a valid blocker activation: damage targets the redirected blocker, normal Character K.O. and attached-DON return apply, and the original target receives no battle damage or K.O. from that attack.

## Authoritative Spec References

- 02-engine-mechanics.s019 (Block Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s022 (End of Battle)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s025 (Keyword behavior)
- 02-engine-mechanics.s036 (DON!! card mechanics)
- 03-game-state-events-decisions.s004 (Engine result)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 11-testing-quality.s008 (Invariant tests)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 02-engine-mechanics.s021 (Damage Step)

1. Compute attacker and target power from `ComputedGameView`.
2. If attacker power is lower than target power, no damage/K.O. occurs.
3. If attacker power is equal or greater:
   - Target Leader: deal damage.
   - Target Character: K.O. target.
4. Emit events for damage, life movement, K.O., card movement.
5. Triggered effects during damage wait until damage processing completes.

### 02-engine-mechanics.s022 (End of Battle)

1. Queue/resolve end-of-battle triggers.
2. Expire battle-duration continuous effects.
3. Clear battle context.
4. Return to Main Phase.

### 02-engine-mechanics.s023 (Damage processing)

For each point of damage:

1. If player has 0 life, mark defeat condition and run rule processing.
2. Otherwise, take the top life card.
3. If the card has `[Trigger]`, ask whether to reveal and activate it instead of adding it to hand.
4. If trigger is activated, the card is temporarily in no zone while the trigger resolves.
5. After trigger resolution, trash the card unless the trigger or a replacement says otherwise.
6. If trigger is declined or unavailable, add the card to hand hidden.

When damage is greater than 1, repeat this process one point at a time in official order.

`[Banish]` replaces the normal life-to-hand/trigger path by trashing the life card instead.

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

### 02-engine-mechanics.s036 (DON!! card mechanics)

- Each DON!! attached to a Leader or Character grants +1000 power during the controller's turn only.
- During Main Phase, a player may give any number of active DON!! from cost area to their Leader or Characters.
- An attached DON!! card has `state: "attached"`; it is neither active nor rested while attached.
- When a card with attached DON!! leaves the field, all attached DON!! return to the owner's cost area rested.
- During Refresh Phase, all attached DON!! return to cost area rested, then the player's Leader, Characters, Stage, and DON!! in cost area become active.
- A `DON!! -X` cost may return the paying player's DON!! from cost area, attached to their Leader, or attached to their Characters unless the card text narrows the source. The paying player chooses the DON!! sources. If there are fewer than X eligible DON!! cards, the cost cannot be paid and the activation is illegal or declined before use is consumed.

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

Own only deterministic blocked-battle resolution after an accepted blocker activation when no unsupported timing windows are present. Stop before Counter Step actions, On Block effects, Unblockable, replacement effects, protection, or effect-runtime queueing.

## Scope

- after valid blocker activation, resolve the supported battle against `battle.currentTarget`
- resolve only when On Block, Counter, End of Battle, On K.O., replacement, protection, battle-duration continuous effects, pending queues, and deferred-trigger timing are absent or already covered by existing generic fail-closed guards
- K.O. the blocker when attacker power is equal or greater, move it to trash, return attached DON!! rested, emit deterministic damage/K.O./movement/DON events, clear battle, and return to Main Phase
- when attacker power is lower than blocker power, clear battle without K.O. or Life movement
- preserve the original target from damage, Life movement, and K.O. after a blocker redirects the attack
- preserve existing Banish behavior only when no blocker redirects to a Character; when a Banish attacker is blocked by a Character, no Life is moved or trashed and only the normal Character K.O. path can apply
- fail closed without mutation for unsupported Counter windows, On Block effects, replacement state, pending effect queues, deferred triggers, Double Attack combinations, Unblockable metadata, stale blocker/current target, unsupported battle steps, protection metadata, On K.O. metadata, End of Battle metadata, or battle-duration continuous-effect metadata

## Out of Scope

- Counter Step actions or auto-pass policy beyond preserving current supported no-counter behavior
- On Block, When Attacking, On Opponent Attack, End of Battle, or On K.O. queueing
- Unblockable support
- replacement/protection effects
- replay schema, CLI/server/client behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/actions.ts
- packages/engine-core/src/actions.test.ts
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts
- packages/engine-core/src/action-test-fixtures.ts
- packages/engine-core/src/battle-actions-test-fixtures.ts

## Constraints

- create the ENG-014D substory branch from the approved ENG-014 parent integration branch and open the ENG-014D PR against that parent branch after human approval of the parent workflow
- do not implement Counter, Unblockable, On Block effects, replacement effects, or new effect-runtime behavior
- fail closed on ambiguous timing or source-presence behavior
- keep engine-core deterministic and pure
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving blocker activation followed by supported resolution K.O.s the blocker and clears battle
- unit test proving attached DON!! returns rested when a blocker is K.O.'d
- unit test proving original Leader target loses no Life after being blocked
- unit test proving original Character target is not K.O.'d after being blocked
- unit test proving lower-power attack into blocker causes no K.O. and no Life movement
- unit test proving Banish attacker blocked by a Character causes no Life movement, no Life trashing, and normal Character K.O. behavior only
- unit test preserving no-blocker Banish Life-trash behavior if shared battle resolution is touched
- unit test asserting deterministic event order, event visibility, event sequence numbers, and final `stateHash` for supported blocked-battle resolution
- negative tests for Counter metadata, On Block/effect metadata, replacement state, pending queues/deferred triggers, Double Attack, Unblockable, stale blocker/current target, protection, On K.O., End of Battle, and battle-duration continuous-effect metadata fail-closed without mutation
- `corepack pnpm exec vitest run packages/engine-core/src/actions.test.ts packages/engine-core/src/battle-actions.test.ts` must pass
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- a valid blocker can redirect an attack and then be K.O.'d through the existing supported damage path
- attached DON!! on a K.O.'d blocker returns rested
- original Leader or Character target does not take damage or get K.O.'d after redirection
- lower-power attacks into a blocker clear battle without K.O. or Life movement
- Banish attacker blocked by a Character causes no Life movement or Life trashing
- supported blocked-battle resolution has deterministic event order, event visibility, and final state hash
- unsupported adjacent timing windows remain fail-closed without mutation

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
