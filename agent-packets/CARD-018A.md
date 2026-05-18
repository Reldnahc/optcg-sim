<!-- agent-packet:story-id CARD-018A -->
<!-- agent-packet:story-path stories/approved/CARD-018A-eng056-057-component-generated-support.yaml -->
<!-- agent-packet:story-sha256 0e41385ba6463a452dd56c2737c0171363f66a2a5e874b1a0b902ee5a306a070 -->
<!-- prettier-ignore-start -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: CARD-018A
Epic ID: CARD-018
Title: ENG-056 and ENG-057 component generated support
Type: implementation
Area: cards
Primary Concern: rules

## Why

Connect the completed ENG-056 trigger and On K.O. reusable queued-body runtime, plus the completed ENG-057 zero-choice continuous choose runtime, to the cards-side component generated-support layer without adding engine behavior, shared schema authority, or card-specific exact templates.

## Authoritative Spec References

- 01-system-architecture.s023 (Poneglyph-centered card-data topology)
- 02-engine-mechanics.s021 (Damage Step)
- 02-engine-mechanics.s023 (Damage processing)
- 02-engine-mechanics.s041 (Auto-effect timing details)
- 03-game-state-events-decisions.s016 (Action envelope inside the engine)
- 03-game-state-events-decisions.s017 (Canonical decision routing)
- 03-game-state-events-decisions.s020 (State hashing)
- 03-game-state-events-decisions.s022 (Internal state sequencing)
- 04-effect-runtime.s005 (Card implementation support)
- 04-effect-runtime.s006 (Effect queue entry)
- 04-effect-runtime.s007 (Source presence policy)
- 04-effect-runtime.s008 (Trigger detection from events)
- 04-effect-runtime.s009 (Queue ordering)
- 04-effect-runtime.s010 (Queue processing)
- 04-effect-runtime.s012 (Player choices during effect resolution)
- 04-effect-runtime.s014 (Continuous effects as computed view)
- 04-effect-runtime.s015 (Duration expiration)
- 04-effect-runtime.s016 (Failure policy)
- 05-effect-dsl-reference.s003 (Top-level definition)
- 05-effect-dsl-reference.s005 (Triggers)
- 05-effect-dsl-reference.s011 (Durations)
- 05-effect-dsl-reference.s013 (Sequence connector semantics)
- 05-effect-dsl-reference.s021 (Example: permanent power buff)
- 05-effect-dsl-reference.s029 (Schema coverage policy)
- 09-card-data-and-support-policy.s010 (Card implementation record)
- 09-card-data-and-support-policy.s011 (Support policy by mode)
- 09-card-data-and-support-policy.s012 (Deck validation)
- 09-card-data-and-support-policy.s013 (Match-time card manifest)
- 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)
- 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)
- 09-card-data-and-support-policy.s016 (Generated support from complete parse)
- 09-card-data-and-support-policy.s022 (Security checklist)
- 09-card-data-and-support-policy.s024 (Source hash and behavior hash)
- 11-testing-quality.s020 (Poneglyph/card-data tests)
- 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)
- 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)
- 23-repo-tooling-and-enforcement.s016 (CI merge gates)

## Relevant Spec Excerpts

### 01-system-architecture.s023 (Poneglyph-centered card-data topology)

Poneglyph is external display/metadata truth. The simulator is gameplay truth.

```text
Poneglyph API
  -> @optcg/cards fetches and validates with Zod
  -> Redis read-through cache stores validated Poneglyph metadata
  -> certified parser rules may generate complete parsed effect definitions
  -> runtime capability matrix gates generated support status
  -> simulator overlay adds reviewed custom behavior, rulings, banlist status, and explicit overrides
  -> match server snapshots resolved cards at match creation
  -> engine consumes the match card manifest and effect registry
```

Important boundaries:

- The match server never trusts Poneglyph data supplied by the client.
- The client may fetch Poneglyph data for images/search/display only.
- The server validates every Poneglyph response before use.
- Simulator overlays are keyed by Poneglyph card ID.
- Common-template support is generated from complete parse plus runtime capability checks, not from a manual per-card allowlist or manual card-to-mechanic map.
- Generated support records are fail-closed: any unparsed, ambiguous, stale, unsupported, or capability-missing component keeps the card unsupported in normal play.
- Poneglyph variant indexes/generated variant keys are cosmetic and stored in deck data, not rule state.

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

### 02-engine-mechanics.s041 (Auto-effect timing details)

- `[When Attacking]` and `[On Your Opponent's Attack]` are distinct timing windows.
- The attacker's `[When Attacking]` effects trigger first.
- Defender's `[On Your Opponent's Attack]` effects trigger after that window.
- `[On K.O.]` activates on field but resolves from trash.
- `[DON!! xX]` triggers or becomes active when attached DON!! count goes from below X to at least X, depending on whether the specific effect is auto or permanent.

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
chooseQuantity
chooseEffectOption
confirmTriggerFromLife
chooseReplacement
orderCards
chooseCharacterToTrashForOverflow
```

For `chooseQuantity`, the response payload shape is `{ type: "chooseQuantity"; quantity: number }`. The outer `respondToDecision.decisionId` must name the active `chooseQuantity` decision. The inner `ChooseQuantityResponse` payload does not carry a decision ID; it is valid only when it has response type `chooseQuantity` and carries a whole integer `quantity` inside the decision's allowed `min` and `max` bounds.

Cardinality is explicit:

- exact-N decisions use `mode: "exact"` and must be represented with `min: N` and `max: N`; `mode: "exact"` with different `min` and `max` values is malformed and must not be created. A response below the required value, above it, non-integer, negative when the minimum is non-negative, or otherwise out-of-range is an `invalidDecisionResponse`.
- up-to-N decisions use `mode: "upTo"` and allow a partial response from `min` through `max`, inclusive. Choosing `max` is legal. Choosing less than `max` is legal only when it is still at least `min`.
- zero is legal only when the decision's `min` is `0`; exact-0 is represented as `min: 0`, `max: 0`, and `mode: "exact"`.
- minimum and maximum bounds are authoritative. Responses below `min`, above `max`, non-integer, missing, or with the wrong response type are rejected as `invalidDecisionResponse`.

Quantity decisions exposed through legal actions must advertise only public bounds, prompt text, and the active decision ID. They must not reveal hidden candidate counts, must not reveal hidden card identities, and must not encode whether a private candidate set contains a particular card. If a quantity is constrained by hidden information, the engine validates against the private candidate set internally and returns `invalidDecisionResponse` for illegal responses without disclosing the hidden reason through public legal actions or public events.

Decision IDs are single-use. A response for an old decision ID is stale unless it is an exact idempotent retry already accepted by the match server.

For optional costs, the only canonical decline route is the active
`PayCostDecision` answered with `PaymentDeclinedResponse`; optional cost decline
must not reuse `chooseOptionalActivation` and must not submit a partial
`PaymentResponse`. A stale optional-cost decision ID, malformed optional-cost
response, wrong player response, insufficient payment, response whose
`optionId` is not one of the active `paymentOptions`, or payment selection
outside the active decision context is rejected as `invalidDecisionResponse`.
These failures fail closed: they do not resolve the decision, do not record a
segment result, do not consume once-per-turn usage or other use counters, do not
emit public events describing hidden payment candidates, and must not reveal
hidden payment candidates, private DON!! choices, or internal failure details
through public legal actions, public events, PlayerView, or SpectatorView.
Optional cost payment uses `PayCostDecision`, not `chooseOptionalActivation`.
Optional cost decline uses `{ type: "paymentDeclined" }` and never carries
payment selections.
A rejected optional-cost response does not consume once-per-turn usage.

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

### 04-effect-runtime.s005 (Card implementation support)

Effects load only from supported implementation records.

```ts
type CardSupportStatus =
  | "vanilla-confirmed"
  | "implemented-dsl"
  | "implemented-custom"
  | "unsupported"
  | "banned-in-simulator";
```

A missing effect definition for a non-vanilla card is an error in normal play. Only dev/sandbox modes may allow unsupported cards.

For generated support, the runtime must expose or consume a capability matrix that describes which keyword bodies, DSL primitives, trigger timings, decision types, replacement processes, visibility modes, target shapes, costs, and custom handlers are currently executable. A generated card support record may be considered playable only when the card has a complete parse and every parsed component is covered by that current runtime capability matrix.

Multiple parsed effects from one card compose into one generated `EffectDefinition` for that card. If any component is unparsed, ambiguous, stale, unsupported, or missing capability evidence, the entire generated support record fails closed for normal play instead of partially enabling the card.

Generated composed runtime shapes must fail closed for normal play when the runtime cannot represent the whole composed execution as a supported resumable frame. Unsupported composed shapes include sequence connectors, saved-result references, optionality boundaries, costs, targets, visibility requirements, or pending-decision continuations that the runtime capability matrix does not cover.

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

Generic composed execution is represented by a resumable effect execution frame stored in `GameState.effectExecutionFrames`. The frame is serialized authoritative runtime context for one resolving effect and is not a client-facing object. It must track at least the queue entry, effect block, current effect path, next segment index, saved result references, segment results, transient selection sets, and pending-decision continuation. Frame records participate in authoritative canonical serialization and state hashes, but filtered player and live spectator views must not expose frame internals.

When a sequence segment pauses for a `PendingDecision`, the runtime stores the frame and returns the pending decision with the same causality context. After a valid response, resolution resumes from the stored frame at the paused segment rather than restarting earlier segments. Completed earlier segments must not be re-applied, and their saved result references and segment results remain available for later connector decisions.

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

Composed execution records one segment result for every attempted sequence segment or optional clause. A segment result must record `attempted`, `succeeded`, `changedState`, `selectedCards`, `selectedTargets`, `paidCost`, and `playerDeclined`. `succeeded` means the segment legally performed its required instruction, while `changedState` separately records whether canonical state changed. Legal selection without mutation may still drive connectors such as "if you do" when card text depends on choosing or identifying an object.

Saved-result references may bind selected cards, selected targets, paid costs, or produced objects for later text such as `that Character`. A later segment may use a saved-result reference only while the referenced object remains legal for that later instruction; otherwise the later segment follows its connector and failure policy. Saved references must preserve hidden-information visibility and replay determinism.

A saved field-object reference is the runtime contract for same-frame `selectedTargets` and `producedObjects` consumers in the same effect execution frame. `selectedTargets` production records the public field objects legally selected by a non-mutating `selectTargets` request segment in the segment result and saved-reference ledger; mutating target effects are not standalone selectedTargets producer authority. `producedObjects` records public field objects produced by a supported segment when the runtime story for that producer explicitly authorizes the produced-object family. Saved hand-selection/playSelected references remain separate from saved field-object references and must not be consumed as field-object targets.

Field-object consumers must validate the saved family, `saveResultAs`, optional object index, current zone, player/controller, filter, public visibility, and instruction legality at consumption time. unsupported saved-reference families fail closed. stale objects, gone objects, hidden objects, and illegal objects fail closed. A fail-closed saved field-object reference records the segment as attempted, not succeeded, and not changedState, then follows the active connector and failure policy. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden identities, hidden candidates, or the private saved-reference failure reason; replay and private effect logs may retain the failure reason for audit. State hashes include the frame saved-reference ledger, the consumer result, and unchanged public/hidden game state so replay, event order, and connector decisions remain deterministic.

Accepted optional cost records `attempted: true`, `succeeded: true`,
`paidCost: true`, and `playerDeclined: false`. Declined optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: true`. Failed optional cost records
`attempted: true`, `succeeded: false`, `changedState: false`,
`paidCost: false`, and `playerDeclined: false`. Optional cost accept, decline,
and failure do not consume once-per-turn usage.

Optional cost segment results participate in the serialized effect execution
frame and authoritative state hash. Event `seq` values and `state.seq`
advancement remain deterministic for accepted, declined, and failed optional
cost branches under `03-game-state-events-decisions.s005` and
`03-game-state-events-decisions.s022`: resolving a valid optional-cost decision
advances `state.seq` once, individual internal events do not each advance
`state.seq`, and rejected stale, malformed, wrong-player, or insufficient
payment responses do not resolve the decision. State hashes include the frame
segment result and unchanged game state for decline or failure branches.

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

exact-card continuous-effect target binding uses `TargetSpec` shape `{ type: "exactCard"; card: CardRef; binding: SavedFieldObjectTargetBinding; createdAtStateSeq: StateSeq }`. A duration-bearing modifier created from a chosen target resolves the saved field-object reference once, stores the exact card target in the `ContinuousEffectRecord`, and does not re-run the original `choose` target during computed-view recalculation. The modifier remains bound to the same card instance while that instance remains legal for the modifier and the duration; if the object is stale, gone, hidden, or illegal, the modifier fails closed without leaking hidden identities.

### 04-effect-runtime.s015 (Duration expiration)

| Duration               | Expiration point                                              |
| ---------------------- | ------------------------------------------------------------- |
| `thisBattle`           | End of Battle                                                 |
| `thisTurn`             | End Phase cleanup                                             |
| `untilEndOfTurn`       | End Phase cleanup                                             |
| `untilStartOfNextTurn` | Start of specified player's next Refresh Phase                |
| `whileSourceOnField`   | When source leaves required zone                              |
| `whileConditionTrue`   | Not active when condition false; removed or ignored by policy |
| `permanent`            | Only for true game-permanent changes; avoid for field buffs   |

### 04-effect-runtime.s016 (Failure policy)

```ts
type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
```

Default is `doAsMuchAsPossible`, unless a connector or card text requires dependency.

For composed execution, failure policy applies to the whole effect block and to each segment through its connector:

- `doAsMuchAsPossible` attempts each supported segment and records per-segment success without rolling back successful independent segments.
- `requiresAll` fails the composed execution before mutation when any required segment cannot legally complete.
- `skipIfNoLegalTarget` skips the composed execution when required activation-time or first required resolution-time targets are absent.
- `optionalIfPossible` offers the optional instruction only when at least one legal execution path exists; if none exists, the segment is not attempted and does not create a decision.

Unsupported composed runtime shapes default to fail-closed rather than degrading to partial execution. Ambiguous connector dependency, saved-reference lifetime, optionality boundary, target visibility, pending-decision continuation, or replacement interaction must be treated as unsupported until the spec and capability matrix authorize it.

### 05-effect-dsl-reference.s003 (Top-level definition)

```ts
interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}

interface EffectDefinitionMetadata {
  sourceTextHash: string;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  tested: boolean;
  reviewer?: string;
  notes?: string;
}
```

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

### 05-effect-dsl-reference.s011 (Durations)

```ts
type Duration =
  | { type: "thisAction" }
  | { type: "thisBattle" }
  | { type: "thisTurn" }
  | {
      type: "untilEndOfTurn";
      whoseTurn?: "current" | "sourceController" | "targetController";
    }
  | { type: "untilStartOfNextTurn"; player: PlayerRef }
  | { type: "whileSourceOnField" }
  | { type: "whileConditionTrue"; condition: Condition }
  | { type: "permanent" };
```

Use `permanent` sparingly. Field buffs should normally be `whileSourceOnField` or a timing duration.
Duration primitives not listed in the schema-supported fixture subset are contract-defined planned layers until schema coverage, validation fixtures, and runtime capability evidence are added.

### 05-effect-dsl-reference.s013 (Sequence connector semantics)

`Effect.type = "sequence"` uses explicit segment connectors. This avoids ambiguity in card text such as "Then", "If you do", and "If possible".

```ts
interface SequencedEffect {
  id?: string;
  effect: Effect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
}
```

Connector behavior:

| Connector             | Runtime behavior                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `always`              | Run this segment regardless of the previous segment result.                                                                          |
| `then`                | Run after the previous segment; if the previous segment was impossible, continue only when card text says to do as much as possible. |
| `ifPreviousSucceeded` | Run only if the previous segment changed game state or made a legal selection.                                                       |
| `ifYouDo`             | Run only if the player chose/performed the previous optional instruction.                                                            |
| `ifPossible`          | Attempt the segment if there is a legal way to perform it; no error if there is not.                                                 |

A segment result must record at least:

```text
attempted
succeeded
changedState
selectedCards
selectedTargets
paidCost
playerDeclined
```

Those fields drive later connector decisions and replay determinism. Runtime frame, pause/resume, saved-reference, and failure-policy behavior for composed execution is authoritative in `04-effect-runtime.s010`, `04-effect-runtime.s012`, and `04-effect-runtime.s016`.

Saved references include `saveResultAs`, `SelectionSetId`, and `SelectionId`. A saved reference is contract-defined here, but generated support may rely on it only when schema validation, parser certification, and runtime capability evidence all cover the reference lifetime, visibility, and later-use legality.

A saved field-object reference is a same-frame saved-reference family for later text such as "that Character". The supported field-object families are `selectedTargets` and `producedObjects`; `selectedCards`, `paidCost`, `SelectionSetId`, `SelectionId`, and saved hand-selection references are separate families and are not field-object target references. A segment with `saveResultAs` may expose `selectedTargets` when it legally selected field objects through a target request, and may expose `producedObjects` when a supported runtime story later creates or moves a public field object and records that object as produced by the segment.

A later segment consumes a saved field-object reference with `{ type: "savedFieldObject", binding: { family: "selectedTargets" | "producedObjects", saveResultAs, objectIndex?, sourceSegmentId? }, zone, player, controller?, filter?, visibility: "publicOnly", onFailure: "failClosed" }`. The reference is valid only inside the same effect execution frame, only for the named `saveResultAs` ledger entry, and only while the referenced object remains a public legal object for the later instruction. unsupported saved-reference families fail closed. stale objects, gone objects, hidden objects, and illegal objects fail closed. Public events, public legal actions, PlayerView, and SpectatorView must not reveal hidden identities or the private saved-reference failure reason. State hashes include the frame saved-reference ledger and the failed segment result so replay, event order, and connector decisions remain deterministic.

Optionality must preserve optional activation, optional cost, and optional effect clause distinctions. These boundaries are part of generated-support capability evidence because a parser that recognizes optional text still cannot make the effect playable unless the runtime can resume and record the correct optional segment result.

Optional cost clauses inside composed sequence execution use a sequence segment
whose effect is `{ type: "payCost"; cost: OptionalCost }`. The optionality flag
lives on the nested `OptionalCost`; `SequencedEffect.optional` remains reserved
for optional effect clauses and must not be used to represent optional cost
decline. Runtime decline for that segment uses the `PayCostDecision` and
`PaymentDeclinedResponse` contract from `03-game-state-events-decisions.s012`
and `03-game-state-events-decisions.s017`.
Optional cost decline uses the active `PayCostDecision` and a
`PaymentDeclinedResponse` payload.

`ifYouDo` after an optional cost runs only when the previous cost segment
recorded `paidCost: true`. A declined or failed optional cost segment does not
run dependent `ifYouDo` segments. Segment-result, event-order, state-hash, and
once-per-turn timing for optional cost accept, decline, and failure are
authoritative in `04-effect-runtime.s011` and `04-effect-runtime.s012`.

### 05-effect-dsl-reference.s021 (Example: permanent power buff)

```json
{
  "cardId": "OP01-001",
  "implementationStatus": "implemented-dsl",
  "effects": [
    {
      "id": "OP01-001:permanent-1",
      "category": "permanent",
      "trigger": { "type": "permanent" },
      "condition": {
        "type": "and",
        "conditions": [
          { "type": "donCount", "target": { "type": "self" }, "min": 1 },
          { "type": "yourTurn" }
        ]
      },
      "sourcePresencePolicy": "mustRemainInSameZone",
      "effect": {
        "type": "modifyPower",
        "target": {
          "type": "all",
          "zone": "characterArea",
          "player": "self",
          "filter": { "typesAny": ["Straw Hat Crew"] }
        },
        "value": 1000,
        "duration": { "type": "whileSourceOnField" }
      }
    }
  ],
  "metadata": {
    "sourceTextHash": "sha256:...",
    "rulesVersion": "2026-01-16",
    "effectDefinitionsVersion": "0.1.0",
    "tested": true
  }
}
```

The runtime should convert this into a `ContinuousEffectRecord`/modifier and apply it through `computeView()`.

When a duration-bearing effect uses a chosen target and later needs exact-card continuous-effect target binding, the runtime must resolve the saved field-object reference once and create a modifier target using the canonical `TargetSpec` shape `{ type: "exactCard"; card: CardRef; binding: SavedFieldObjectTargetBinding; createdAtStateSeq: StateSeq }`. The chosen target does not re-run the original `choose` target during computed-view recalculation. The modifier remains bound to the same card instance until its duration expires or the exact card is no longer a legal public object for that modifier.

### 05-effect-dsl-reference.s029 (Schema coverage policy)

`contracts/effect-dsl.schema.json` is the executable JSON fixture contract.
TypeScript/spec primitives outside that JSON schema are planned/not
fixture-authorable until schema validation and fixtures exist.
This list is the fixture-authorability boundary, not generated playable support.
Schema authorability alone does not imply runtime-executable,
parser-certified, or generated-support playable status. New TYP schema stories
may move primitives into the schema-supported fixture subset only when they also
add schema coverage and validation fixtures; generated playable support still
requires complete parser support and runtime capability evidence.

Schema-supported fixture subset:

- trigger: onPlay
- trigger: whenAttacking
- trigger: onOpponentAttack
- trigger: onBlock
- trigger: onKO
- trigger: endOfYourTurn
- trigger: endOfOpponentTurn
- trigger: trigger
- trigger: activateMain
- trigger: main
- trigger: counter
- trigger: permanent
- trigger: startOfGame
- trigger: startOfYourTurn
- trigger: startOfOpponentTurn
- trigger: startOfMainPhase
- trigger: endOfBattle
- trigger: donAttach
- trigger: custom
- condition: yourTurn
- condition: attachedDonCount
- condition: fieldCount
- cost: restDon
- cost: returnDon
- cost: restSelf
- cost: sequence
- target: self, myLeader, opponentLeader, attacker, attackTarget, blocker,
  triggerCard, all, choose, savedFieldObject
- duration: thisAction
- duration: thisBattle
- duration: thisTurn
- duration: untilEndOfTurn
- duration: untilStartOfNextTurn
- duration: whileSourceOnField
- duration: permanent
- effect: draw
- effect: drawUpTo
- effect: ko
- effect: modifyPower
- effect: payCost
- effect: selectCards
- effect: selectTargets
- effect: playSelected
- effect: sequence
- effect: cannotAttack
- effect: cannotBlock
- effect: custom
- card filters: cardIds, names, nameContains, nameNot, categories, colorsAny,
  colorsAll, typesAny, typesAll, attributesAny, attributesAll, cost, power,
  counter, hasKeywords, lacksKeywords, state, owner, controller, excludeSelf,
  custom

Planned/not fixture-authorable until schema coverage exists:

- condition: donCount
- condition: opponentTurn
- condition: lifeCount
- condition: handCount
- condition: trashCount
- condition: hasCardInZone
- condition: attackTarget
- condition: cardState
- condition: sourceStillInZone
- condition: eventPayload
- condition: and, or, not, custom
- cost: trashFromHand
- cost: trashSelf
- cost: trashFromField
- cost: discard
- cost: chooseOne
- cost: custom
- duration: whileConditionTrue
- effect: search
- effect: lookAtTop
- effect: revealFromZone
- effect: revealTop
- effect: selectFromSet
- effect: moveSelected with position
- effect: putRemaining
- effect: shuffleDeck
- effect: bounce
- effect: trash
- effect: play
- effect: returnUnselectedToDeck
- effect: trashFromHand
- effect: setPowerToZero
- effect: setBasePower
- effect: modifyCost
- effect: setBaseCost
- effect: rest
- effect: activate
- effect: giveKeyword
- effect: removeKeyword
- effect: addDon
- effect: attachDon
- effect: returnDon
- effect: addLife
- effect: damage
- effect: invalidateEffects
- effect: protectFromKO
- effect: cannotBeAttacked
- effect: cannotBeBlockedBy
- effect: choice
- effect: conditional
- effect: forEachMatch
- effect: repeat
- effect: replacement

new fixture-authorable primitives must add schema coverage and validation fixtures in the same story that makes the primitive authorable.

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
  generatedSupportId?: string;
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // hash of Poneglyph printed text used for review drift
  notes?: string;
}
```

A card with printed effect text but no implementation must be marked `unsupported`, not omitted. For common templates, implementation may come from a generated support index entry instead of a manual per-card overlay when the complete parse, parser certification, and runtime capability checks all pass.

### 09-card-data-and-support-policy.s011 (Support policy by mode)

| Status                |              Dev sandbox | Unranked / custom |                         Ranked |
| --------------------- | -----------------------: | ----------------: | -----------------------------: |
| `vanilla-confirmed`   |                  Allowed |           Allowed |                        Allowed |
| `implemented-dsl`     |                  Allowed |           Allowed |                        Allowed |
| `implemented-custom`  |                  Allowed | Allowed if tested | Allowed if tested and reviewed |
| `unsupported`         |     Allowed with warning |          Rejected |                       Rejected |
| `banned-in-simulator` | Rejected unless override |          Rejected |                       Rejected |

Missing overlay records should fail closed in public modes. A non-vanilla Poneglyph card without support metadata is treated as `unsupported`.

### 09-card-data-and-support-policy.s012 (Deck validation)

Deck validation resolves and validates against Poneglyph IDs, Poneglyph legality records, and simulator support metadata. Poneglyph is the canonical external source for format/card legality inputs such as legal status, bans, and copy limits; the simulator may only layer unsupported-card policy or platform-specific constraints on top.

Generated support index output is simulator support metadata. Deck validation may treat a generated record as `implemented-dsl` or `implemented-custom` only when the record has complete parse evidence, current source/behavior hashes, certified parser-rule evidence, and a runtime capability matrix result proving every component is supported.

```ts
interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  resolvedCards: ResolvedDeckCard[];
  versions: {
    cardDataVersion: string;
    effectDefinitionsVersion: string;
    overlayVersion: string;
    banlistVersion: string;
  };
}
```

Validation checks:

- Leader count and leader identity.
- Main deck size.
- DON!! deck size.
- Leader/color restrictions.
- Per-card copy limits by Poneglyph base `cardId`.
- Official format restrictions.
- Simulator-specific bans.
- Unsupported-card status.
- Variant IDs resolve to valid Poneglyph variants for the base card.

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

### 09-card-data-and-support-policy.s014 (Canonical Poneglyph normalization)

The Poneglyph adapter emits `ResolvedCard` from `contracts/canonical-types.ts`. Important normalization rules:

- `attribute` values become `attributes: Attribute[]`; never collapse to a singular attribute.
- `color` values become `colors: CardColor[]`; multi-color cards preserve all colors.
- `variants[].index` becomes `variantIndex`.
- `variantKey = `${cardId}:v${variantIndex}``.
- Missing market prices, product set codes, or image URLs are allowed display gaps and must not fail gameplay resolution.
- Search endpoint DTOs are never accepted as manifest card details. Only detail/batch card payloads can become `ResolvedCard`.
- `sourceTextHash` covers printed effect/trigger text used for implementation drift.
- `behaviorHash` covers stats, type line, effect, trigger, official FAQ, errata, and any source field that can alter behavior.

### 09-card-data-and-support-policy.s015 (Poneglyph text hash and stale-card review)

Every supported card stores a hash of its Poneglyph printed text and, when generated support is used, a behavior hash or parser-evidence hash for the complete parsed behavior.

When the Poneglyph text changes:

1. Mark the card implementation as stale.
2. Fail CI if a stale card remains marked `tested` without review.
3. Prevent ranked use if the changed text affects card behavior.
4. Require parser/support evidence to be updated before generated support may remain playable.
5. Require a reviewer to update the source hash after verifying any DSL/custom handler or certified parser-rule evidence that remains authoritative.

This catches errata, typo fixes that affect parsing, and Poneglyph schema/text changes.

### 09-card-data-and-support-policy.s016 (Generated support from complete parse)

Common-template card support is generated from complete parsing plus runtime capability checks. It must not depend on a manual per-card allowlist or a manual card-to-mechanic map for templates that parser certification already covers.

CARD parser/generated-support stories consume completed contract/schema plus runtime-capability evidence before parser certification or generated-support linkage may enable normal-mode support. Contract/schema completion alone is not playable support.

Complete parse means every gameplay-relevant part of a card is parsed: printed effect text, trigger text, keyword text, costs, conditions, timing windows, target or selection requirements, visibility requirements, replacement effects, optionality, once-per-turn limits, source-presence rules, and official rulings or errata that affect behavior. Non-gameplay display fields such as images and flavor-like presentation do not need DSL parse evidence, but any field that can affect behavior must be represented or explicitly proven irrelevant.

A runtime capability matrix records which generated components the current engine can execute. It must cover at least keyword bodies, DSL primitives, trigger timings, decision/response types, costs, target/selection shapes, movement operations, replacement processes, continuous modifiers, visibility modes, event/hash requirements, and custom handlers. The matrix is versioned with effect/runtime support evidence and must be updated when runtime capabilities expand or contract.

The generated support index maps Poneglyph card IDs and source hashes to generated `EffectDefinition` IDs, parser-rule versions, parser evidence, runtime capability results, support status, and review state. Multiple parsed effects for one card compose into one generated `EffectDefinition` for that card. If every parsed component is supported by the current runtime capability matrix and parser-rule certification allows automatic support, the generated support index may mark the card playable in the appropriate modes.

Partial support reporting is allowed and encouraged for progress tracking. It may report parsed components, unparsed spans, ambiguous parse classes, missing runtime capabilities, stale hashes, and unsupported custom-handler needs. Partial support does not make a card playable in normal modes, and partial support or effect coverage progress never enables normal play.

Generated support fails closed. If any component is unparsed, ambiguous, stale, unsupported, missing capability evidence, missing parser certification, or affected by Bandai/Poneglyph wording drift, the card is rejected for normal play until parser/support evidence is updated. New parser rules, ambiguous parse classes, custom handlers, and wording or ruling ambiguity require review before they can certify support.

### 09-card-data-and-support-policy.s022 (Security checklist)

- Server never trusts card metadata from client.
- Poneglyph response is schema-validated before cache write.
- Overlay merge is versioned.
- Match snapshots resolved cards before play starts.
- Unsupported cards are rejected in public modes.
- Variant IDs are cosmetic and never affect rules.
- Poneglyph text hash changes trigger implementation review.
- Replays store versions and manifest hashes.

### 09-card-data-and-support-policy.s024 (Source hash and behavior hash)

Use both hashes:

```ts
interface CardImplementationRecord {
  cardId: CardId;
  status: CardSupportStatus;
  effectDefinitionId?: string;
  customHandlerIds?: string[];
  tested: boolean;
  rulesVersion: string;
  cardDataVersion: string;
  sourceTextHash: string; // effect + trigger text only
  behaviorHash: string; // stats + type line + effect + trigger + FAQ + errata
  notes?: string;
}
```

`OP01-060` demonstrates why `behaviorHash` matters: the FAQ clarifies that an unplayed revealed card returns to the top of the deck face-down. A change to that FAQ would affect hidden-information behavior even if the printed effect text did not change.

### 11-testing-quality.s020 (Poneglyph/card-data tests)

Add card-data tests once `@optcg/cards` exists:

```text
CD-001 Poneglyph response validates against Zod schema
CD-002 invalid Poneglyph shape fails before Redis cache write
CD-003 Redis cache key includes cardDataVersion and overlay/effect version
CD-004 overlay merge adds support status and effect definition IDs
CD-005 Poneglyph source text hash drift marks implementation stale
CD-006 unsupported non-vanilla Poneglyph card cannot enter ranked deck
CD-007 variant indexes/generated variant keys are accepted only when valid for the base card
CD-008 client display data cannot alter server-resolved match manifest
CD-009 generated support index accepts only complete-parse cards whose every parsed component is covered by the runtime capability matrix
CD-010 partial, ambiguous, stale, unparsed, unsupported, or capability-missing generated support reports do not make cards playable in normal modes
CD-011 certified parser-rule fixtures auto-support matching complete-parse common-template cards without a manual per-card allowlist
```

These tests prevent the card-data layer from becoming an implicit rules authority.

### 23-repo-tooling-and-enforcement.s005 (Workspace structure and task naming)

Use `pnpm`; the root workspace must provide `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`, and `pnpm verify` is the canonical local pre-push command.

### 23-repo-tooling-and-enforcement.s006 (TypeScript enforcement)

Implementation packages stay in strict TypeScript mode, and broad escape hatches such as `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions require explicit justification.

### 23-repo-tooling-and-enforcement.s016 (CI merge gates)

Lint, formatting, and merge-gate verification are mandatory, and CI must fail when checked-in generated artifacts or snapshots are stale.

## Story Boundary

Own only packages/cards parser/component evidence, runtime capability matrix, generated-support indexing, diagnostics, and tests needed to make currently runtime-supported ENG-056 and ENG-057 shapes available through componentized generated support. Do not add engine behavior, new effect primitives, shared contracts/schema authority, source fixture support, or real-card hash changes.

## Scope

- inventory current component evidence and runtime capability records for ENG-056 life Trigger, ENG-056 On K.O., and ENG-057 zero-choice continuous choose support before implementation
- add cards-side component/runtime capability evidence for life Trigger wrappers only where ENG-056A can truthfully run the parsed body from life-trigger no-zone source presence
- add cards-side component/runtime capability evidence for On K.O. wrappers only where ENG-056B can truthfully run the parsed body from supported K.O. source-presence policy
- explicitly preserve the ENG-056B-reviewed rejection of generic continuous On K.O. shapes, including continuous self-target effects and whileSourceOnField duration/source-presence shapes
- limit On K.O. support to body and source-policy combinations backed by reviewed ENG-056B evidence, including existing supported On K.O. draw behavior and reviewed drawUpTo pause/resume behavior, rather than every component-supported queued body
- add cards-side component/runtime capability evidence for zero-choice choose continuous modifyPower, cannotAttack, and cannotBlock shapes now supported by ENG-057A
- allow existing reusable body parser components to compose with Trigger and On K.O. wrappers only when wrapper evidence, body evidence, source-presence evidence, schema validation, runtime capability evidence, generated-support metadata, and source integrity all pass
- support `up to N` as existing cardinality/choice component grammar for ENG-057A zero-choice continuous modifier and restriction shapes, not as exact text templates
- keep self/all continuous templates supported where their existing runtime capability evidence remains truthful
- keep hand-selection grammar separate from public field choose-target grammar
- preserve parser/report/probe diagnostics from CARD-015 through CARD-017, including component evidence IDs and missing-layer reporting
- use representative wrapper/body and zero-choice composition tests rather than testing every body with every wrapper or every card
- preserve all existing CARD-008 through CARD-017 generated-support behavior and component IDs unless a migration is explicitly required and regression-tested

## Out of Scope

- engine runtime behavior
- new runtime capability truth not backed by completed ENG work
- new effect primitives
- shared TYP/contracts/schema changes
- real-card fixture support, fixture capture, fixture recapture, source hash updates, behavior hash updates, overlays, or supported-card manifest changes
- broad trigger families beyond life Trigger and On K.O.
- event-card or stage-card play support beyond already supported generated-support bodies
- replacement generalization
- generic continuous On K.O. support, continuous self-target On K.O. support, or On K.O. whileSourceOnField support
- disappeared selected-target no-op behavior for nonzero choose selections
- server, client, API, UI, database, replay, WebSocket, Redis, or live Poneglyph work

## Allowed Touch Points

<!-- prettier-ignore -->
- packages/cards/src/composed-parser-builder.ts
- packages/cards/src/composed-parser-builder.test.ts
- packages/cards/src/certified-card-text-parser.ts
- packages/cards/src/certified-card-text-parser.test.ts
- packages/cards/src/card014g-composed-parser.ts
- packages/cards/src/card014g-generated-support.test.ts
- packages/cards/src/generated-support-index.ts
- packages/cards/src/generated-support-index.test.ts
- packages/cards/src/generated-support-report.ts
- packages/cards/src/generated-support-report.test.ts
- packages/cards/src/generated-support-types.ts
- packages/cards/src/generated-support-types.test.ts
- packages/cards/src/runtime-capability-matrix.ts
- packages/cards/src/runtime-capability-matrix.test.ts
- packages/cards/src/support-probe.ts
- packages/cards/src/support-probe.test.ts
- packages/cards/src/*support*.test.ts
- agent-packets/CARD-018A.md
- stories/generated/CARD-018*.yaml
- stories/approved/CARD-018*.yaml
- agent-packets/active.json

## Constraints

- approve CARD-018A only after distinct durable parent and child story-review artifacts exist for the CARD-018 story set
- generate and activate the CARD-018A packet before implementation
- stay within allowed_touch_points
- do not add engine runtime behavior, shared schema authority, fixture support, source hash updates, or card-specific exact templates
- use component evidence and representative composition tests rather than wrapper/body cartesian-product testing
- fail closed if runtime capability, schema authority, source integrity, metadata, or review/test evidence is missing
- use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`
- TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification
- ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale

### Code Standard

Follow [`docs/code-standard.md`](docs/code-standard.md). Non-negotiables:

- stay inside the approved story boundary
- preserve package boundaries
- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors
- prefer named exports and precise types
- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard
- split by reason-to-change, not by line count
- do not over-split into tiny files or generic dumping grounds
- keep engine-core pure and hidden-info safe
- prove engine behavior with synthetic/unit/regression tests
- keep real-card fixture tests separate from engine behavior requirements
- preserve deterministic event ordering and state hashes
- record ambiguity instead of inventing behavior

## Required Tests

- story-review for CARD-018A before approval handoff
- runtime capability inventory test proving ENG-056 and ENG-057 component evidence is backed by completed runtime stories and does not claim unsupported runtime behavior
- parser/component tests for life Trigger wrapper composition with at least one existing supported no-choice body and one existing supported decision-pausing body
- parser/component tests for On K.O. wrapper composition with at least one existing supported no-choice body and one existing supported decision-pausing body
- generated-support tests proving Trigger and On K.O. wrapper/body support uses component evidence rather than full-template parser rule identity
- generated-support tests proving unsupported wrapper/body/source-policy combinations fail closed with component or missing-layer diagnostics
- generated-support tests proving generic continuous On K.O., continuous self-target On K.O., and On K.O. whileSourceOnField shapes remain unsupported
- generated-support tests for zero-choice choose continuous modifyPower, cannotAttack, and cannotBlock with `up to 1` target cardinality
- missing runtime capability tests for zero-choice choose continuous modifier/restriction support
- regression tests proving existing self/all continuous modifier and restriction support remains unchanged
- regression tests proving current CARD-008 through CARD-017 supported and unsupported behavior remains compatible
- support-probe and generated-support report tests proving Trigger, On K.O., and zero-choice failures surface component/layer diagnostics
- stale-hash, invalid-dsl-schema, and metadata/review/test gate regressions proving those deeper blockers keep their priority and identity
- run `corepack pnpm run packets:verify`
- run `corepack pnpm run stories:validate`
- run `corepack pnpm --filter @optcg/cards test`
- full `corepack pnpm verify`

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- life Trigger parser/component support can compose with currently supported trigger-compatible generated-support bodies without exact wrapper/body template IDs
- On K.O. parser/component support can compose with currently supported onKO-compatible generated-support bodies without exact wrapper/body template IDs
- On K.O. generic continuous, continuous self-target, and whileSourceOnField shapes remain unsupported with clear component or missing-layer diagnostics
- zero-choice `up to 1` choose-target continuous modifyPower, cannotAttack, and cannotBlock generated-support shapes pass when ENG-057A-backed runtime capability evidence is present
- the same zero-choice shapes report missing runtime capability and remain unsupported when that evidence is absent
- malformed, ambiguous, stale, unsupported-wrapper, unsupported-body, unsupported-source-policy, unsupported-target, unsupported-duration, unsupported-modifier, unsupported-restriction, schema-invalid, source-invalid, metadata-invalid, untested, and unreviewed shapes remain unsupported
- existing supported generated-support shapes remain supported
- existing unsupported generated-support shapes remain unsupported except for the ENG-056 and ENG-057 shapes intentionally enabled by this story
- support-probe and generated-support report diagnostics name the missing component or layer when support fails
- tests prove representative composition and negative gates without requiring every body to be paired with every wrapper

## Post-Approval Role Sections

### implementation

Responsibilities
- implement only the approved story using packet authority order
- follow strict TypeScript, lint, and verification requirements
- report ambiguity instead of inventing uncited behavior

Forbidden Actions
- do not broaden scope beyond the approved story boundary or allowed_touch_points
- do not add packet extraction behavior unless the approved story explicitly owns it
- do not implement story-author/story-review handoff mechanics

Required Inputs
- active packet content with authoritative spec references
- approved story scope, non-scope, and acceptance criteria
- allowed_touch_points and required test list

Required Outputs
- scoped code and test changes within approved touch points
- verification command results with pass/fail status
- assumptions and blockers note

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

### code-review

Responsibilities
- review correctness, scope fit, and required-test coverage
- verify no forbidden role sections or lifecycle changes were introduced
- confirm canonical packet behavior remains enforceable

Forbidden Actions
- do not author new feature scope outside the reviewed patch
- do not bypass required tests, packet verification, or CI gate evidence
- do not approve scope drift that violates story boundary

Required Inputs
- proposed patch limited to approved touch points
- active packet, approved story, and cited spec references
- verification and test evidence for required commands

Required Outputs
- review findings prioritized by correctness and scope compliance
- clear disposition for findings (fix/defer/block) with rationale
- review closure recommendation for Session Orchestrator handoff

Verification Checklist
- confirm required inputs are present and current
- confirm forbidden actions are not introduced
- confirm required outputs are produced for handoff

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

<!-- prettier-ignore-end -->
