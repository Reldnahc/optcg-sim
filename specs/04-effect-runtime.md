---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "04-effect-runtime"
doc_title: "Effect Runtime"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Effect Runtime

<!-- SECTION_REF: 04-effect-runtime.s001 -->

Section Ref: `04-effect-runtime.s001`

## Overview

<!-- SECTION_REF: 04-effect-runtime.s002 -->

Section Ref: `04-effect-runtime.s002`

The effect runtime executes effect definitions against the authoritative game state.

```text
Effect definitions        Runtime                 Engine core
DSL + custom handlers --> queue/choices/events --> atomic state mutations
```

The runtime must preserve timing, hidden information, source-presence rules, replacement effects, and deterministic replay.

**v6 contract:** queue entries, decisions, replacement state, and continuous-effect records are defined in [`contracts/canonical-types.ts`](contracts/canonical-types.ts). The algorithms below are normative when they are more precise than older snippets.

## Effect categories

<!-- SECTION_REF: 04-effect-runtime.s003 -->

Section Ref: `04-effect-runtime.s003`

| Category    | Runtime behavior                                           |
| ----------- | ---------------------------------------------------------- |
| Auto        | Detected from `EngineEvent`s and queued.                   |
| Activate    | Exposed through legal actions during valid timing windows. |
| Permanent   | Contributes continuous modifiers to computed view.         |
| Replacement | Intercepts replaceable processes before atomic mutation.   |

## Stable effect identity

<!-- SECTION_REF: 04-effect-runtime.s004 -->

Section Ref: `04-effect-runtime.s004`

Every effect block has a stable ID. Never key `[Once Per Turn]` by array index.

```ts
interface EffectBlock {
  id: string; // e.g. "OP01-001:auto-1" or "OP01-040:activate-main-1"
  trigger: Trigger;
  category: EffectCategory;
  condition?: Condition;
  cost?: Cost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  effect: Effect;
}
```

The `id` should remain stable across definition edits unless the effect's identity truly changes.

## Card implementation support

<!-- SECTION_REF: 04-effect-runtime.s005 -->

Section Ref: `04-effect-runtime.s005`

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

## Effect queue entry

<!-- SECTION_REF: 04-effect-runtime.s006 -->

Section Ref: `04-effect-runtime.s006`

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

## Source presence policy

<!-- SECTION_REF: 04-effect-runtime.s007 -->

Section Ref: `04-effect-runtime.s007`

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

## Trigger detection from events

<!-- SECTION_REF: 04-effect-runtime.s008 -->

Section Ref: `04-effect-runtime.s008`

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

## Queue ordering

<!-- SECTION_REF: 04-effect-runtime.s009 -->

Section Ref: `04-effect-runtime.s009`

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

## Queue processing

<!-- SECTION_REF: 04-effect-runtime.s010 -->

Section Ref: `04-effect-runtime.s010`

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

## Conditions and costs

<!-- SECTION_REF: 04-effect-runtime.s011 -->

Section Ref: `04-effect-runtime.s011`

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

## Player choices during effect resolution

<!-- SECTION_REF: 04-effect-runtime.s012 -->

Section Ref: `04-effect-runtime.s012`

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

## Replacement effects

<!-- SECTION_REF: 04-effect-runtime.s013 -->

Section Ref: `04-effect-runtime.s013`

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

## Continuous effects as computed view

<!-- SECTION_REF: 04-effect-runtime.s014 -->

Section Ref: `04-effect-runtime.s014`

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

## Duration expiration

<!-- SECTION_REF: 04-effect-runtime.s015 -->

Section Ref: `04-effect-runtime.s015`

| Duration               | Expiration point                                              |
| ---------------------- | ------------------------------------------------------------- |
| `thisBattle`           | End of Battle                                                 |
| `thisTurn`             | End Phase cleanup                                             |
| `untilEndOfTurn`       | End Phase cleanup                                             |
| `untilStartOfNextTurn` | Start of specified player's next Refresh Phase                |
| `whileSourceOnField`   | When source leaves required zone                              |
| `whileConditionTrue`   | Not active when condition false; removed or ignored by policy |
| `permanent`            | Only for true game-permanent changes; avoid for field buffs   |

## Failure policy

<!-- SECTION_REF: 04-effect-runtime.s016 -->

Section Ref: `04-effect-runtime.s016`

```ts
type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";
```

Default is `doAsMuchAsPossible`, unless a connector or card text requires dependency.

## Transient reveal and selection sets

<!-- SECTION_REF: 04-effect-runtime.s017 -->

Section Ref: `04-effect-runtime.s017`

Transient sets are part of effect execution context, not normal zones. They exist for patterns such as revealing the top card, selecting from a revealed set, and returning unselected cards face-down.

Rules:

1. A transient set has an origin, visibility, and cleanup policy.
2. Cards in a transient set are not simultaneously in hand/deck/trash/life.
3. Movement from a transient set to a real zone must emit a `cardMoved` event with appropriate visibility.
4. If an effect exits early, cleanup policy runs before the queue continues.
5. Opponent views may see a revealed card only for the duration and visibility specified by the effect. If the card returns face-down to a hidden zone, future opponent views must not retain its ID.

## Custom handlers

<!-- SECTION_REF: 04-effect-runtime.s018 -->

Section Ref: `04-effect-runtime.s018`

Custom handlers are an escape hatch, not a shortcut.

Use a custom handler when:

- The effect needs state tracking not represented by DSL primitives.
- The effect modifies core rules.
- The effect has complex nested choices that would make the DSL unreadable.
- A new DSL primitive would be premature for a one-off effect.

Handlers must be pure, immutable, deterministic, and test-covered.

```ts
interface CustomHandler {
  id: string;
  cardId: CardId;
  effectId: string;
  execute(state: GameState, context: EffectContext): EngineResult;
}
```

If several handlers repeat the same logic, promote that behavior into a DSL primitive.

## Effect logging

<!-- SECTION_REF: 04-effect-runtime.s019 -->

Section Ref: `04-effect-runtime.s019`

For replay, log:

- Triggering player action.
- Public and private decisions/responses.
- Random choices/shuffles by RNG call count.
- Effect IDs queued/resolved/cancelled.
- State hashes at checkpoints.

Do not rely on transient JavaScript function behavior for replay. Custom handler versions must be part of `effectDefinitionsVersion` or their own handler version manifest.
