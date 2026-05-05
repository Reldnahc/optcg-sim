<!-- agent-packet:story-id ENG-010G -->
<!-- agent-packet:story-path stories/approved/ENG-010G-battle-runtime-fail-closed-integration.yaml -->
<!-- agent-packet:story-sha256 f9a739787d46002e03e491144180e447e91a598307513196bf9c4619a918054f -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-010G
Epic ID: M1-001
Title: Route vanilla battle pending-runtime fail-closed path through scaffold
Type: implementation
Area: engine
Primary Concern: rules

## Why

Replace supported vanilla battle's ad hoc pending runtime checks with shared runtime pending-work detection while preserving battle-facing fail-closed behavior.

## Authoritative Spec References

- 02-engine-mechanics.s003 (Rule-processing checkpoints)
- 02-engine-mechanics.s017 (Battle sequence)
- 02-engine-mechanics.s018 (Attack Step)
- 02-engine-mechanics.s020 (Counter Step)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s021 (Invariant hooks)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 03-game-state-events-decisions.s023 (Error handling inside the engine)
- 04-effect-runtime.s008 (Trigger detection from events)
- 04-effect-runtime.s009 (Queue ordering)
- 04-effect-runtime.s010 (Queue processing)
- 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

### 02-engine-mechanics.s003 (Rule-processing checkpoints)

Run rule processing after every atomic state change, not only after player actions.

```ts
function afterAtomicMutation(result: EngineStepResult): EngineStepResult {
  const checked = checkRuleProcessing(result.state);
  return { ...result, state: checked };
}
```

Rule processing checks:

- Leader damage when that player has 0 life.
- Deck-out at a rule-processing checkpoint.
- Effect-created win/loss conditions.
- Simultaneous loss resulting in draw.
- Invariant violations in development/test mode.

Concession is immediate and cannot be replaced or prevented.

### 02-engine-mechanics.s017 (Battle sequence)

A battle is a sub-state inside Main Phase.

### 02-engine-mechanics.s018 (Attack Step)

1. Attacker rests an active Leader or Character.
2. Attacker selects target: opponent Leader or one rested opponent Character.
3. Emit `attackDeclared`.
4. Queue attacker's `[When Attacking]` effects in the attack timing window.
5. Resolve that attack timing window.
6. If attacker or target left its zone or is no longer a legal battle participant, skip to End of Battle.

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

### 04-effect-runtime.s010 (Queue processing)

```ts
function processEffectQueue(state: GameState): EngineResult {
  let allEvents: EngineEvent[] = [];

  while (state.effectQueue.length > 0) {
    const entry = dequeueEffect(state);
    state = markResolving(state, entry.id);

    if (!canQueuedEffectResolve(entry, state)) {
      const cancelled = cancelQueuedEffect(
        state,
        entry,
        "source-or-condition-failed",
      );
      state = cancelled.state;
      allEvents.push(...cancelled.events);
      continue;
    }

    const resolution = executeEffectBlock(state, entry);
    state = resolution.state;
    allEvents.push(...resolution.events);

    const checked = checkRuleProcessingWithEvents(state, {
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlock.id,
      },
    });
    state = checked.state;
    allEvents.push(...checked.events);

    if (state.status.type === "gameOver") {
      return { state, events: allEvents, stateHash: hashState(state) };
    }

    const triggered = detectTriggeredEffects(state, resolution.events);
    state = enqueueTriggeredEffectsRespectingTiming(state, triggered);
  }

  return { state, events: allEvents, stateHash: hashState(state) };
}
```

There is no `return` inside the loop unless the game ends, an unrecoverable error occurs, or a pending decision pauses resolution.

### 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)

```text
M2-001 On Play draw queues and resolves
M2-002 When Attacking effect resolves before defender On Opponent Attack window
M2-003 blocker redirects attack and emits blockerActivated
M2-004 counter character grants battle power until end of battle
M2-005 counter event is trashed and effect resolves
M2-006 On K.O. activates on field and resolves from trash or last known info
M2-007 life Trigger resolves from no zone then moves to trash unless replaced
M2-008 simultaneous triggers controlled by same player require order decision
M2-009 turn player effect A, opponent effect B, new turn-player effect C resolves A-B-C
M2-010 damage-processing triggers wait until all damage points complete
M2-011 continuous +1000 modifier does not mutate base state
M2-012 replacement effect applies once per process
M2-013 optional effect creates chooseOptionalActivation decision
M2-014 target selection respects visibility and legal candidates
M2-015 unsupported non-vanilla card is rejected outside dev sandbox
M2-016 once-per-turn failed cost does not consume use
M2-017 once-per-turn committed effect that later fizzles still consumes use
M2-018 defender on-opponent-attack effects resolve before ordinary counter actions
M2-019 post-counter missing attacker or target skips Damage Step
M2-020 replacement choice uses chooseReplacement decision and logs replacementApplied
M2-021 replacement cannot apply twice to same process
M2-022 transient revealed card returned face-down is removed from opponent view
```

### 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)

Boundary enforcement is mechanical: `@optcg/engine-core` cannot import React, browser code, WebSocket transport, Redis, Postgres, or live HTTP clients.

### 15-implementation-kickoff.s012 (Guardrails)

Kickoff guardrails require the engine to stay free of Redis, Postgres, WebSocket, React, and Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution consumes resolved manifests rather than live HTTP calls.

## Story Boundary

Own only supported vanilla battle handling of non-empty `effectQueue` and `deferredTriggers`. Stop before changing start-of-main, play-card, replay fixtures, trigger detection, queue execution, event sequencing, legal-action gating, or blocker/counter/trigger/replacement/effect decisions.

## Scope

- update supported vanilla battle resolution to use shared runtime pending-work detection for non-empty `effectQueue` and `deferredTriggers`
- preserve current battle-facing `illegalAction` classification, reason semantics, and no-mutation behavior for pending runtime work
- preserve current accepted vanilla battle behavior when runtime queues are empty

## Out of Scope

- changing any accepted vanilla behavior
- changing start-of-main, play-card, replay smoke fixtures, replay validation, or legal-action gating
- changing event id format, event seq allocation, event visibility, state sequence increments, state hash behavior, rule-processing timing, or invariant timing
- implementing trigger detection, queue execution, source-presence policy, blocker, counter, life triggers, Event effects, On Play effects, replacement, continuous effects, or once-per-turn tracking
- changing replay schema, CLI grammar, server protocol, browser UI, database, Redis, WebSocket, React, live HTTP, or Poneglyph behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/battle-actions.ts
- packages/engine-core/src/battle-actions.test.ts

## Constraints

- keep the patch behavior-preserving; if any state hash, event sequence, event id, legal action, pending decision, or existing test expectation changes, stop and split or record the ambiguity
- fail closed on ambiguous timing-window, source-presence, trigger ordering, hidden-information, or replay behavior
- keep engine-core deterministic and pure
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- unit test proving supported vanilla battle with non-empty `effectQueue` fails with unchanged `illegalAction` classification, current `reason` semantics, and no mutation or appended events
- unit test proving supported vanilla battle with non-empty `deferredTriggers` fails with unchanged `illegalAction` classification, current `reason` semantics, and no mutation or appended events
- unit or existing test proving supported vanilla battle with non-empty `replacementState` preserves current fail-closed classification, reason semantics, and no mutation or appended events
- existing `packages/engine-core/src/battle-actions.test.ts` unsupported trigger/blocker/counter/doubleAttack/banish fail-closed tests must pass with unchanged assertions
- existing accepted vanilla battle tests in `packages/engine-core/src/battle-actions.test.ts` must pass with unchanged assertions
- `corepack pnpm --filter @optcg/engine-core typecheck` must pass
- `corepack pnpm run verify` must pass

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- supported vanilla battle non-empty `effectQueue` fails through shared runtime pending-work detection with unchanged battle-facing `illegalAction` classification, current `reason` semantics, and no-mutation behavior
- supported vanilla battle non-empty `deferredTriggers` fails through shared runtime pending-work detection with unchanged battle-facing `illegalAction` classification, current `reason` semantics, and no-mutation behavior
- supported vanilla battle non-empty `replacementState` fail-closed behavior remains unchanged
- current accepted vanilla battle behavior is unchanged when runtime queues are empty

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
