<!-- agent-packet:story-id ENG-028D -->
<!-- agent-packet:story-path stories/approved/ENG-028D-resolve-simple-life-trigger-effect.yaml -->
<!-- agent-packet:story-sha256 783fc0ddc6073332a80df032fb4dc7b50b0c18ab6ce3959185bb5071762faa3d -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: ENG-028D
Epic ID: KICK-001
Title: Resolve simple life trigger effect
Type: implementation
Area: engine
Primary Concern: rules

## Why

Resolve a supported no-choice life Trigger effect from no zone and trash the activated Trigger card afterward.

## Authoritative Spec References

- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s040 (Trigger card zone)
- 03-game-state-events-decisions.s005 (Event journal)
- 03-game-state-events-decisions.s018 (Canonical event visibility)
- 03-game-state-events-decisions.s020 (State hashing)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s008 (Trigger detection from events)
- 04-effect-runtime.s009 (Queue ordering)
- 04-effect-runtime.s010 (Queue processing)
- 05-effect-dsl-reference.s005 (Triggers)
- 05-effect-dsl-reference.s012 (Effects)
- 06-visibility-security.s005 (Temporary visibility)
- 06-visibility-security.s006 (Effect event visibility)
- 11-testing-quality.s007 (Interaction tests)
- 18-acceptance-tests.s004 (Milestone 2 - first effect runtime)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)
- 23-repo-tooling-and-enforcement.s008 (Boundary enforcement)
- 15-implementation-kickoff.s012 (Guardrails)

## Relevant Spec Excerpts

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

### 02-engine-mechanics.s040 (Trigger card zone)

When a Life card with `[Trigger]` is activated:

1. The card is revealed.
2. It is in no zone while the trigger resolves.
3. After resolution, it is trashed unless the trigger or a replacement says otherwise.

The `[Trigger]` trash is replaceable if a replacement effect specifically applies.

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

### 04-effect-runtime.s007 (Source presence policy)

A simple "cancel if source moved" rule is not enough. Zone-transition triggers such as `[On K.O.]` must activate on field and resolve after the card moves to trash.

```ts
type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";
```

Recommended defaults:

| Trigger/effect kind           | Policy                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[When Attacking]`            | `mustRemainInSameZone`                                                                                |
| `[On Your Opponent's Attack]` | `mustRemainInSameZone`                                                                                |
| `[On Block]`                  | `mustRemainInSameZone`                                                                                |
| `[On K.O.]`                   | `resolveFromDestinationZone` or `resolveFromLastKnownInformation`, depending on ruling/implementation |
| `[Trigger]` from life         | `resolveFromLastKnownInformation` or `noSourceRequired` while in no zone                              |
| Event `[Main]` / `[Counter]`  | `resolveFromDestinationZone` after event is trashed                                                   |
| Global rule-created effect    | `noSourceRequired`                                                                                    |

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

### 05-effect-dsl-reference.s005 (Triggers)

```ts
type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack" }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };
```

### 05-effect-dsl-reference.s012 (Effects)

```ts
type Effect =
  // Card movement
  | { type: "draw"; count: number; player: PlayerRef }
  | { type: "drawUpTo"; count: number; player: PlayerRef }
  | { type: "search"; request: SearchRequest }
  | { type: "lookAtTop"; player: PlayerRef; count: number }
  | {
      type: "revealFromZone";
      player: PlayerRef;
      zone: Zone;
      count?: number;
      filter?: CardFilter;
      to: Visibility;
    }
  | {
      type: "moveSelected";
      selection: SelectionId;
      from: Zone | SelectionSetId;
      to: Zone;
      position?: "top" | "bottom";
    }
  | {
      type: "putRemaining";
      zone: Zone;
      position: "top" | "bottom";
      order: "ownerChoice" | "chooserChoice" | "random";
    }
  | { type: "shuffleDeck"; player: PlayerRef }
  | {
      type: "bounce";
      target: Target;
      destination: "hand" | "deckTop" | "deckBottom";
    }
  | { type: "trash"; target: Target }
  | { type: "ko"; target: Target }
  | {
      type: "play";
      source: Zone;
      player: PlayerRef;
      filter: CardFilter;
      costModifier?: number;
    }
  | {
      type: "trashFromHand";
      player: PlayerRef;
      count: number;
      filter?: CardFilter;
      chooser: PlayerRef;
    }

  // Power/cost modification
  | { type: "modifyPower"; target: Target; value: number; duration: Duration }
  | { type: "setPowerToZero"; target: Target; duration: Duration }
  | { type: "setBasePower"; target: Target; value: number; duration: Duration }
  | {
      type: "modifyCost";
      filter: CardFilter;
      value: number;
      duration: Duration;
      player: PlayerRef;
    }
  | { type: "setBaseCost"; target: Target; value: number; duration: Duration }

  // State and keywords
  | { type: "rest"; target: Target }
  | { type: "activate"; target: Target }
  | {
      type: "giveKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }
  | {
      type: "removeKeyword";
      target: Target;
      keyword: Keyword;
      duration: Duration;
    }

  // DON!!
  | { type: "addDon"; count: number; player: PlayerRef }
  | { type: "attachDon"; target: Target; count: number; player: PlayerRef }
  | { type: "returnDon"; count: number; player: PlayerRef }

  // Life and damage
  | {
      type: "addLife";
      count: number;
      player: PlayerRef;
      source: "deck" | "hand" | "trash";
      faceUp?: boolean;
    }
  | { type: "damage"; target: "leader"; player: PlayerRef; count: number }

  // Restrictions/protections
  | { type: "invalidateEffects"; target: Target; duration: Duration }
  | { type: "protectFromKO"; target: Target; duration: Duration }
  | { type: "cannotAttack"; target: Target; duration: Duration }
  | { type: "cannotBlock"; target: Target; duration: Duration }
  | { type: "cannotBeAttacked"; target: Target; duration: Duration }
  | {
      type: "cannotBeBlockedBy";
      target: Target;
      filter: CardFilter;
      duration: Duration;
    }

  // Composition
  | { type: "sequence"; effects: SequencedEffect[] }
  | {
      type: "choice";
      chooser: PlayerRef;
      options: EffectOption[];
      min: number;
      max: number;
    }
  | { type: "conditional"; if: Condition; then: Effect; else?: Effect }
  | {
      type: "forEachMatch";
      zone: Zone;
      player: PlayerRef;
      filter: CardFilter;
      effect: Effect;
    }
  | { type: "repeat"; count: number; effect: Effect }

  // Replacement/custom
  | { type: "replacement"; when: ReplacementTrigger; instead: Effect }
  | { type: "custom"; handler: string };
```

### 06-visibility-security.s005 (Temporary visibility)

Some events reveal hidden cards temporarily.

| Event                    | Who sees                                        | Duration                                       |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Playing card from hand   | Both players                                    | Reveal through placement/resolution            |
| Counter card from hand   | Both players                                    | Reveal through trash/effect resolution         |
| Activated life trigger   | Both players                                    | Reveal through trigger resolution              |
| Declined life trigger    | Nobody except server                            | Never shown                                    |
| Search/look at deck      | Searching player only unless effect says reveal | During effect resolution                       |
| Effect reveals hand/life | As specified by effect                          | During effect resolution or specified duration |
| Trash from hidden zone   | Public once in trash                            | From arrival in trash onward                   |

```ts
interface RevealRecord {
  id: string;
  card: CardRef;
  sourceZone: Zone;
  reason:
    | "play"
    | "counter"
    | "trigger"
    | "search"
    | "lookAt"
    | "effect"
    | "trash";
  visibleTo: "both" | PlayerId[] | "replayOnly";
  expires: RevealExpiration;
}
```

The engine must remove expired `RevealRecord`s as part of effect cleanup.

### 06-visibility-security.s006 (Effect event visibility)

The game log can leak information if not filtered.

```ts
interface EffectEvent {
  id: string;
  sourceCardId: CardId;
  sourceInstanceId?: InstanceId;
  effectId: string;
  description: string;
  choices?: PublicChoiceSummary;
  visibleTo: "both" | PlayerId[] | "replayOnly";
}
```

Examples:

- Public target selection: visible to both.
- Searching deck: opponent sees "Opponent is searching deck" and maybe count, not card IDs.
- Choosing a card from hand to trash: opponent sees the resulting public trash card, not pre-choice hand options.

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

Own only the supported no-choice activated Trigger resolution path and trash-after-resolution cleanup. Do not add new effect primitives, complex Trigger effects, replacement behavior, target selection, or search/look/reveal primitives.

## Scope

- support exactly one implemented-dsl auto Trigger effect block with trigger type trigger, sourcePresencePolicy resolveFromLastKnownInformation or noSourceRequired, effect type draw, count 1, player self, and no cost, condition, optional flag, once-per-turn usage, target selection, replacement behavior, custom handler, or source-moving behavior
- resolve the activated Trigger through deterministic runtime events and rule-processing checkpoints
- move the activated Trigger card to trash after supported resolution for this exact supported draw-1 shape
- expire the temporary reveal/no-zone runtime state after resolution cleanup
- preserve Banish behavior as no Trigger path
- fail closed without mutation for unsupported Trigger effect bodies, costs, conditions, target selection, optional effects, replacement effects, or custom handlers
- fail closed without mutation for source-moving Trigger effects or any Trigger shape outside the exact supported draw-1 contract

## Out of Scope

- new effect primitives beyond the currently supported no-choice path
- Banish changes
- Double Attack or multiple damage handling
- replacement effects
- complex Trigger effects
- search, look, or reveal primitives
- target selection
- optional effects beyond the life-trigger confirm decision
- server/client/UI

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/engine-core/src/life-trigger-actions.ts
- packages/engine-core/src/life-trigger-actions.test.ts
- packages/engine-core/src/effect-runtime.ts
- packages/engine-core/src/effect-runtime.test.ts
- packages/engine-core/src/battle-resolution.ts
- packages/engine-core/src/battle-damage-banish.test.ts
- packages/engine-core/src/event-sequencing-regression.test.ts
- packages/engine-core/src/filter-state-for-player.ts
- packages/engine-core/src/filter-state-for-player.real-states.test.ts
- stories/approved/ENG-028D-resolve-simple-life-trigger-effect.yaml
- agent-packets/ENG-028D.md
- agent-packets/active.json

## Constraints

- story-review must pass before moving this story to approved or implementing
- generate and activate only the ENG-028D packet while implementing this story
- run corepack pnpm run packets:verify before implementation and review handoff
- stay within allowed_touch_points
- target the ENG-028 parent integration branch
- do not run packets:complete after merging only into the parent integration branch
- if supported resolution requires new DSL primitives, replacement behavior, search/look/reveal primitives, or target selection, stop and split or record the blocker
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale
- `@optcg/engine-core` must stay free of React, browser code, WebSocket transport, Redis, Postgres, and live HTTP clients
- The engine must not import Redis, Postgres, WebSocket, React, or Poneglyph HTTP code; once hidden state exists, the client must use `view-engine` instead of `engine-core`, and effect resolution must consume resolved manifests rather than live HTTP calls

## Required Tests

- run corepack pnpm exec vitest run packages/engine-core/src/life-trigger-actions.test.ts packages/engine-core/src/effect-runtime.test.ts packages/engine-core/src/battle-damage-banish.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/engine-core/src/filter-state-for-player.real-states.test.ts
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

- an activated implemented-dsl draw-1 Trigger with no cost, condition, optional flag, once-per-turn usage, target selection, replacement behavior, custom handler, or source-moving behavior resolves deterministically from no zone
- the activated Trigger card is trashed after supported draw-1 resolution
- reveal/no-zone transient state is cleaned up after resolution
- rule processing still runs after the Trigger effect resolution
- every other Trigger body, including costs, conditions, optional effects, targets, search/look/reveal, replacement, custom handlers, and source-moving effects, fails closed without mutation
- event sequencing and final state hash are stable for identical Trigger activation scenarios

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
