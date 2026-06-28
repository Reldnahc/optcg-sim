# Counter Event Runtime Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Counter Event mini-engine with a single Counter-step wrapper that queues `[Counter]` effect blocks into the normal effect runtime.

**Architecture:** `useCounter` should handle only Counter-step duties: legal action exposure, printed Event cost payment, Event movement from hand to trash, and queue insertion. All effect behavior after the Event is activated must use the existing effect queue, sequence frame, target selection, optional cost, continuous modifier, and battle cleanup systems. Legacy Counter Event power/runtime/sequence/trailing branches are removed after equivalent behavior is covered by tests.

**Tech Stack:** TypeScript, Vitest, `@optcg/engine-core` battle/effect runtime, `@optcg/card-support` behavior probes.

---

## File Structure

- Modify `packages/engine-core/src/battle/counter-card-use.ts`
  - Keep Character Counter handling.
  - Replace Event Counter handling with generic `[Counter]` activation.
  - Remove old special branch state: `counterValue`, `runtimeEffects`, `sequenceEffects`, `trailingSequence`, and Counter Event effect-cost target rerouting.

- Modify `packages/engine-core/src/battle/counter-actions.ts`
  - Make legal action exposure ask the new generic Counter Event support helper instead of `getSupportedCounterEventPower`, `getSupportedCounterEventRuntime`, and `getSupportedCounterEventSequence`.
  - Remove custom Counter target decision routing.

- Create `packages/engine-core/src/battle/counter-event-activation.ts`
  - Own the new generic Counter Event APIs:
    - `getSupportedCounterEventActivation`
    - `getSupportedCounterEventActivations`
    - `queueCounterEventEffects`
    - `resolveCounterEventPrintedCostPayment`
  - This file must not know individual body primitives beyond asking runtime support.

- Modify `packages/engine-core/src/battle/counter-window-support.ts`
  - Use `getSupportedCounterEventActivations` for potential Counter Event actions.

- Modify or delete `packages/engine-core/src/battle/counter-event-support.ts`
  - Delete after the new helper replaces all imports.
  - If a temporary migration is needed during one task, leave only compatibility exports inside the same task and remove them before final verification.

- Delete after references are gone:
  - `packages/engine-core/src/battle/counter-event-power-record.ts`
  - `packages/engine-core/src/battle/counter-event-target-decision.ts`
  - `packages/engine-core/src/battle/counter-event-sequence-resolution.ts`
  - `packages/engine-core/src/battle/counter-event-trailing-sequence.ts`

- Keep `packages/engine-core/src/battle/counter-event-runtime-queue-entry.ts`
  - Rename or update if useful, but preserve the queue-entry construction responsibility.
  - Queue entries should be normal `pending` entries unless a called runtime API requires `resolving`.

- Modify tests:
  - `packages/engine-core/src/battle/counter-flow.test.ts`
  - `packages/engine-core/src/battle/counter-event-runtime.test.ts`
  - `packages/engine-core/src/battle/counter-event-targeting.test.ts`
  - `packages/engine-core/src/battle/counter-invalid.test.ts`
  - `packages/card-support/src/behavior-probe.test.ts`
  - `packages/card-support/src/behavior-probe.ts`

---

## Invariants

- Character Counter cards keep their existing behavior.
- Event Counter cards are legal only during a supported Counter Step.
- Printed Event cost is paid before the Event leaves hand and before its effects resolve.
- The Event moves from hand to trash exactly once.
- `[Counter]` conditions are evaluated by the same runtime condition machinery used by other queued effects.
- Target selection, optional costs, hidden-information choices, and sequences are handled by the normal runtime.
- `thisBattle` power modifiers must affect the current battle result.
- `thisTurn` and longer continuous modifiers must be visible in normal computed views after the Counter effect resolves.
- Behavior probe must not pass a Counter Event scenario while a target/payment/effect decision is still pending, unless the remaining pending decision is only the regular Counter-step pass decision after the Counter Event effect has fully resolved.

---

### Task 1: Add Failing Full-Flow Test For Non-Power Counter Restriction

**Files:**
- Modify: `packages/engine-core/src/battle/counter-event-runtime.test.ts`

- [ ] **Step 1: Add imports needed by the new test**

At the top of `packages/engine-core/src/battle/counter-event-runtime.test.ts`, make sure these imports exist:

```ts
import { computeView } from "../view/compute-view.js";
import { processEffectRuntime } from "../effect-runtime.js";
```

If one already exists, do not duplicate it.

- [ ] **Step 2: Add a local helper for the specific Counter Event**

Append this helper near the existing `installSupportedCounterSequenceEvent` helper:

```ts
const installCannotAttackCounterEvent = (
  state: ReturnType<typeof setupAttackState>,
  counterEvent: CardInstance,
): void => {
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
    cardId: counterEvent.cardId,
    category: "event",
    cost: 0,
    support: {
      cardId: counterEvent.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "counter-event-runtime-test",
      cardDataVersion: "counter-event-runtime-test",
      sourceTextHash: "counter-event-runtime-test",
      behaviorHash: "counter-event-runtime-test",
      effectDefinitionId: definitionId,
    },
  });
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      id: definitionId,
      cardId: counterEvent.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: `${definitionId}:effect`,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          condition: { type: "lifeCount", player: "self", op: "lte", value: 2 },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "selected:thatCharacter",
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: { categories: ["character"], state: "active" },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "cannotAttack",
                  target: {
                    type: "savedFieldObject",
                    player: "opponent",
                    zones: ["characterArea"],
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
          },
        },
      ],
      metadata: {
        effectDefinitionsVersion: "counter-event-runtime-test",
        rulesVersion: "counter-event-runtime-test",
        sourceTextHash: "counter-event-runtime-test",
      },
    },
  };
};
```

- [ ] **Step 3: Add the failing regression test**

Append this test:

```ts
test("Counter Event cannot-attack sequence fully resolves and blocks the selected Character", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterEvent = must(p2State.hand[0], "counter event");
  const restrictedAttacker = must(p1State.characters[0], "p1 character");
  restrictedAttacker.state = "active";
  restrictedAttacker.turnPlayed = state.turn.globalTurn - 1;
  p2State.life = p2State.life.slice(0, 2);
  installCannotAttackCounterEvent(state, counterEvent);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(used.errors, undefined);

  let current = used;
  for (let step = 0; step < 5; step += 1) {
    if (current.state.pendingDecision?.type === "selectTargets") break;
    current = processEffectRuntime(current.state);
  }
  const targetDecision = must(
    current.state.pendingDecision,
    "cannot-attack target decision",
  );
  assert.equal(targetDecision.type, "selectTargets");

  const selected = applyAction(current.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [cardRef(restrictedAttacker, p1)] },
  });
  assert.equal(selected.errors, undefined);

  let resolved = selected;
  for (let step = 0; step < 5; step += 1) {
    if (resolved.state.effectQueue.length === 0) break;
    resolved = processEffectRuntime(resolved.state);
  }
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotAttack" &&
        effect.modifier.target.type === "exactCard" &&
        effect.modifier.target.card.instanceId === restrictedAttacker.instanceId,
    ),
    true,
  );

  const afterBattle = {
    ...resolved.state,
    battle: undefined,
    pendingDecision: undefined,
    turn: { ...resolved.state.turn, turnPlayerId: p1, phase: "main" as const },
  };
  const view = computeView(afterBattle);
  assert.deepEqual(view.legalAttackTargets[restrictedAttacker.instanceId], []);
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle/counter-event-runtime.test.ts
```

Expected: fail because the old Counter Event path does not fully resolve this targeted non-power restriction into a useful attack restriction.

- [ ] **Step 5: Commit the failing test only**

```powershell
git add packages/engine-core/src/battle/counter-event-runtime.test.ts
git commit -m "test: expose targeted counter event restriction gap"
```

---

### Task 2: Introduce Generic Counter Event Activation Support

**Files:**
- Create: `packages/engine-core/src/battle/counter-event-activation.ts`
- Modify: `packages/engine-core/src/battle/counter-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-card-use.ts`
- Test: `packages/engine-core/src/battle/counter-event-runtime.test.ts`

- [ ] **Step 1: Create the support module**

Create `packages/engine-core/src/battle/counter-event-activation.ts`:

```ts
import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { isEffectBlockInvalidated } from "../effect-invalidation.js";
import { isSupportedSequenceBlock } from "../effect-runtime-sequence/support.js";
import { toSingleEffectSequence } from "../effect-runtime-sequence/support-normalization.js";
import { toCounterEventRuntimeQueueEntry } from "./counter-event-runtime-queue-entry.js";

export interface SupportedCounterEventActivation {
  readonly printedCost: number;
  readonly effects: readonly (EffectDefinition["effects"][number] & {
    readonly effect: Extract<EffectDefinition["effects"][number]["effect"], { type: "sequence" }>;
  })[];
}

export const getSupportedCounterEventActivation = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
): SupportedCounterEventActivation | null => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (
    metadata?.category !== "event" ||
    metadata.support.status !== "implemented-dsl" ||
    metadata.support.effectDefinitionId === undefined ||
    (metadata.support.customHandlerIds?.length ?? 0) > 0
  ) {
    return null;
  }
  const definition =
    state.cardManifest.effectDefinitions?.[metadata.support.effectDefinitionId];
  if (definition?.implementationStatus !== "implemented-dsl") {
    return null;
  }
  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }
  const effects = definition.effects
    .filter((effect) => effect.trigger.type === "counter")
    .map((effect) => toSupportedCounterSequence(state, card, controllerId, effect));
  if (effects.length === 0 || effects.some((effect) => effect === null)) {
    return null;
  }
  return {
    printedCost,
    effects: effects as SupportedCounterEventActivation["effects"],
  };
};

export const getSupportedCounterEventActivations = (
  state: GameState,
  controllerId: PlayerId,
): readonly { readonly card: CardInstance; readonly activation: SupportedCounterEventActivation }[] => {
  const player = state.players[controllerId];
  if (player === undefined) {
    return [];
  }
  return player.hand.flatMap((card) => {
    const activation = getSupportedCounterEventActivation(state, card, controllerId);
    return activation === null ? [] : [{ card, activation }];
  });
};

const toSupportedCounterSequence = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
  effect: EffectDefinition["effects"][number],
): SupportedCounterEventActivation["effects"][number] | null => {
  if (
    effect.category !== "auto" ||
    effect.trigger.type !== "counter" ||
    effect.optional === true ||
    effect.oncePerTurn === true ||
    effect.conditionTiming !== undefined ||
    effect.cost !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    isEffectBlockInvalidated(state, card, effect)
  ) {
    return null;
  }
  const sequenceEffect =
    effect.effect.type === "sequence"
      ? effect.effect
      : toSingleEffectSequence(effect.effect);
  const sequenceBlock = { ...effect, effect: sequenceEffect };
  const entry = toCounterEventRuntimeQueueEntry(
    state,
    controllerId,
    card,
    sequenceBlock,
  );
  if (!counterEventConditionPasses(state, entry, sequenceBlock)) {
    return null;
  }
  if (!isSupportedSequenceBlock(entry, sequenceBlock)) {
    return null;
  }
  return sequenceBlock;
};

const counterEventConditionPasses = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: EffectDefinition["effects"][number],
): boolean => {
  if (effect.condition === undefined) {
    return true;
  }
  const evaluated = evaluateQueuedEffectCondition(state, entry, effect.condition);
  return evaluated.supported && evaluated.passed;
};
```

- [ ] **Step 2: Run typecheck and fix exact type errors**

Run:

```powershell
npm.cmd run typecheck
```

Expected initially: possible type errors around the `Extract<...>` sequence type. Fix by importing `Effect` and spelling the sequence type as `Extract<Effect, { type: "sequence" }>` if needed.

- [ ] **Step 3: Commit the support module**

```powershell
git add packages/engine-core/src/battle/counter-event-activation.ts
git commit -m "feat: add generic counter event activation support"
```

---

### Task 3: Route Legal Counter Event Actions Through Generic Activation

**Files:**
- Modify: `packages/engine-core/src/battle/counter-card-use.ts`
- Modify: `packages/engine-core/src/battle/counter-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-window-support.ts`

- [ ] **Step 1: Replace legal action discovery**

In `packages/engine-core/src/battle/counter-card-use.ts`, replace imports from `counter-event-support.ts` used only for legal action discovery with:

```ts
import {
  getSupportedCounterEventActivation,
  getSupportedCounterEventActivations,
} from "./counter-event-activation.js";
```

In `getLegalCharacterCounterActions`, replace the Event branch with:

```ts
const eventActivation =
  metadata?.category === "event"
    ? getSupportedCounterEventActivation(state, card, defenderId)
    : null;
```

Use this legality condition:

```ts
(eventActivation !== null &&
  getActiveDonCount(defender.costArea) >= eventActivation.printedCost)
```

For legal Event actions, return exactly one action targeting `battle.currentTarget`:

```ts
if (metadata?.category === "event" && eventActivation !== null) {
  return [
    {
      type: "useCounter" as const,
      cardInstanceId: card.instanceId,
      target: battle.currentTarget,
    },
  ];
}
```

- [ ] **Step 2: Update counter window support**

In `packages/engine-core/src/battle/counter-window-support.ts`, replace `getSupportedCounterEventPowerTargets` usage with `getSupportedCounterEventActivations`.

The potential Counter Event check should be:

```ts
getSupportedCounterEventActivations(state, defenderId).some(
  ({ activation }) => getActiveDonCount(defender.costArea) >= activation.printedCost,
)
```

Import `getActiveDonCount` from `../play-card/support.js` if not already available.

- [ ] **Step 3: Run focused legal-action tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle/counter-flow.test.ts packages/engine-core/src/battle/counter-invalid.test.ts
```

Expected: some old target-specific Counter Event tests may fail because generic activation exposes a single current-battle-target `useCounter` action. Keep failures for Task 4 unless they are compile failures.

- [ ] **Step 4: Commit if compile-safe**

```powershell
git add packages/engine-core/src/battle/counter-card-use.ts packages/engine-core/src/battle/counter-actions.ts packages/engine-core/src/battle/counter-window-support.ts
git commit -m "refactor: expose counter events through generic activation"
```

---

### Task 4: Replace Event Counter Resolution With Queue Insertion

**Files:**
- Modify: `packages/engine-core/src/battle/counter-card-use.ts`
- Modify: `packages/engine-core/src/battle/counter-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-event-activation.ts`

- [ ] **Step 1: Add queue insertion helper**

Add to `packages/engine-core/src/battle/counter-event-activation.ts`:

```ts
import { appendEvent, toStateSeq } from "../action-results.js";
import type { EngineEvent } from "@optcg/types";

export const queueCounterEventEffects = (params: {
  readonly state: GameState;
  readonly controllerId: PlayerId;
  readonly source: CardInstance;
  readonly activation: SupportedCounterEventActivation;
}): { readonly state: GameState; readonly events: readonly EngineEvent[] } => {
  const events: EngineEvent[] = [];
  const entries = params.activation.effects.map((effectBlock) =>
    toCounterEventRuntimeQueueEntry(
      params.state,
      params.controllerId,
      params.source,
      effectBlock,
    ),
  );
  for (const entry of entries) {
    appendEvent(
      params.state,
      events,
      "effectQueued",
      {
        queueEntryId: entry.id,
        timingWindowId: entry.timingWindowId,
        generation: entry.generation,
        effectBlockId: entry.effectBlockId,
        source: entry.source,
        orderingGroup: entry.orderingGroup,
      },
      { type: "public" },
    );
  }
  return {
    events,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      effectQueue: [...params.state.effectQueue, ...entries],
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};
```

If `effectQueued` payload shape differs, copy the exact payload from an existing queue insertion event in the repo and keep this helper as the only Counter Event queue insertion point.

- [ ] **Step 2: Replace Event branch in `applyUseCounter`**

In `packages/engine-core/src/battle/counter-card-use.ts`, inside `applyUseCounter`, for `metadata?.category === "event"`:

1. call `getSupportedCounterEventActivation(state, handCard, decision.playerId)`;
2. reject if null;
3. reject if active DON is below printed cost;
4. if printed cost is greater than zero, create the existing printed `payCost` decision using `counterPayCostDecisionId(..., "printed")`;
5. if printed cost is zero, call the new common resolver that moves the Event to trash and queues the effects.

The zero-cost resolver call should look like:

```ts
return resolveCounterEventActivation({
  state,
  decisionPlayerId: decision.playerId,
  battle,
  handCard,
  activation,
  costArea: defender.costArea,
  decisionResolvedId: undefined,
  pendingDecision: state.pendingDecision,
  priorEvents: [],
  options,
});
```

- [ ] **Step 3: Add `resolveCounterEventActivation`**

In `counter-card-use.ts`, extract the existing Event-specific movement and event emission out of `resolveCounterCardUse` into a focused helper named `resolveCounterEventActivation`. The helper must have this signature:

```ts
const resolveCounterEventActivation = (params: {
  readonly state: GameState;
  readonly decisionPlayerId: PlayerId;
  readonly battle: NonNullable<GameState["battle"]>;
  readonly handCard: CardInstance;
  readonly activation: SupportedCounterEventActivation;
  readonly costArea: CardInstance[];
  readonly decisionResolvedId?: NonNullable<GameState["pendingDecision"]>["id"];
  readonly pendingDecision?: NonNullable<GameState["pendingDecision"]>;
  readonly priorEvents: readonly EngineEvent[];
  readonly options?: EngineResultOptions;
}): EngineResult;
```

Build it by moving these exact responsibilities from the existing Event branch:

- append `decisionResolved` when `decisionResolvedId` is present;
- append `counterUsed` with the same payload currently emitted for Event counters;
- move `handCard` from hand to trash through `moveConcreteCardsToTrash` with `reason: "counter"`, `sourceZone: "hand"`, public movement/trash visibility, `clearAttachedDon: true`, `emitCardTrashed: true`, and `includeCardIdentityInCardMoved: true`;
- preserve the supplied `costArea` on the defender after payment;
- find the moved Event in trash and pass it to `queueCounterEventEffects`;
- set `battle` back onto the returned state while the queued Counter effect resolves;
- clear `pendingDecision` unless `queueCounterEventEffects` returns no queue entries, in which case restore `pendingDecision` to the supplied regular Counter-step pass decision;
- return `toEngineResult` with `priorEvents`, local movement events, and queue events in order.

Character Counter cards must continue to use the existing Character branch in `resolveCounterCardUse`. After this helper exists, `resolveCounterCardUse` should no longer receive Event-specific parameters such as `runtimeEffects`, `sequenceEffects`, `counterValue`, or `trailingSequence`.

- [ ] **Step 4: Handle printed cost decision continuation**

In `applyCounterStepDecisionResponse` in `counter-actions.ts`, for printed Counter Event `payCost`:

1. parse the card id from `counterPayCostDecisionId`;
2. find the hand Event;
3. call `getSupportedCounterEventActivation`;
4. validate selected active DON count equals `activation.printedCost`;
5. rest selected DON;
6. call `resolveCounterEventActivation`.

Remove branches for `supportedCounterEvent`, `supportedRuntimeEvent`, and `supportedSequenceEvent`.

- [ ] **Step 5: Run the failing regression**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle/counter-event-runtime.test.ts
```

Expected: the new cannot-attack regression passes. Existing tests may still fail where they assert old special `battle.counterPower`.

- [ ] **Step 6: Commit queue-based Counter Event resolution**

```powershell
git add packages/engine-core/src/battle/counter-card-use.ts packages/engine-core/src/battle/counter-actions.ts packages/engine-core/src/battle/counter-event-activation.ts
git commit -m "refactor: resolve counter events through effect queue"
```

---

### Task 5: Replace `battle.counterPower` With Normal `thisBattle` Continuous Power

**Files:**
- Modify: `packages/engine-core/src/battle/counter-flow.test.ts`
- Modify: `packages/engine-core/src/battle/damage-*.test.ts` only where tests directly inspect `battle.counterPower`
- Modify: battle resolution code that reads `battle.counterPower`
- Modify: `packages/engine-core/src/runtime/conditions/card-stat-comparison.ts`
- Modify: `packages/engine-core/src/runtime/continuous/target-matching.ts`

- [ ] **Step 1: Find all remaining `counterPower` references**

Run:

```powershell
rg -n "counterPower" packages/engine-core/src
```

Expected before this task: references remain in tests and battle math.

- [ ] **Step 2: Convert power Counter tests to behavioral assertions**

In tests such as `counter-flow.test.ts`, replace assertions like:

```ts
assert.equal(battleCounterPower(used.state.battle), 4000);
```

with view or battle-result assertions:

```ts
const view = computeView(used.state);
assert.equal(view.cards[p2State.leader.instanceId]?.currentPower, 9000);
```

For battle outcome tests, assert damage prevention / K.O. result instead of the internal field.

- [ ] **Step 3: Remove `battle.counterPower` reads from battle calculations**

Where battle math currently adds `battle.counterPower`, rely on computed card power from continuous effects instead. The Counter Event should have queued a normal `modifyPower` effect with `duration: { type: "thisBattle" }`, and battle resolution should use the same current-power path already used for other temporary power effects.

- [ ] **Step 4: Remove `counterPower` from condition helpers**

In:

- `packages/engine-core/src/runtime/conditions/card-stat-comparison.ts`
- `packages/engine-core/src/runtime/continuous/target-matching.ts`

remove special `battle.counterPower` handling. Conditions must read current computed power from continuous effects.

- [ ] **Step 5: Run focused battle tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle
```

Expected: all battle tests pass without `battle.counterPower`.

- [ ] **Step 6: Assert no production `counterPower` remains**

Run:

```powershell
rg -n "counterPower" packages/engine-core/src -g "*.ts"
```

Expected: no production references. If tests keep a helper name temporarily, rename it or delete it in this task.

- [ ] **Step 7: Commit**

```powershell
git add packages/engine-core/src
git commit -m "refactor: remove legacy counter power state"
```

---

### Task 6: Delete Legacy Counter Event Branches And Files

**Files:**
- Delete:
  - `packages/engine-core/src/battle/counter-event-support.ts`
  - `packages/engine-core/src/battle/counter-event-power-record.ts`
  - `packages/engine-core/src/battle/counter-event-target-decision.ts`
  - `packages/engine-core/src/battle/counter-event-sequence-resolution.ts`
  - `packages/engine-core/src/battle/counter-event-trailing-sequence.ts`
- Modify any importers.

- [ ] **Step 1: Find legacy imports**

Run:

```powershell
rg -n "counter-event-support|counter-event-power-record|counter-event-target-decision|counter-event-sequence-resolution|counter-event-trailing-sequence|getSupportedCounterEventPower|getSupportedCounterEventRuntime|getSupportedCounterEventSequence|createCounterEventTargetDecision|continueCounterEventTrailingSequence" packages/engine-core/src
```

Expected: references remain only in files to be updated in this task.

- [ ] **Step 2: Remove legacy imports and dead branches**

In `counter-actions.ts` and `counter-card-use.ts`, remove code paths that parse `counterTargetDecisionId`, create custom Counter Event target decisions, or pass `runtimeEffects`, `sequenceEffects`, and `trailingSequence`.

- [ ] **Step 3: Delete legacy files**

Use `apply_patch` delete hunks for the five files listed above.

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: pass. If imports remain, delete them and rerun.

- [ ] **Step 5: Run battle tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/engine-core/src/battle
git commit -m "refactor: remove legacy counter event runtime"
```

---

### Task 7: Harden Behavior Probe For Counter Events

**Files:**
- Modify: `packages/card-support/src/behavior-probe.ts`
- Modify: `packages/card-support/src/behavior-probe.test.ts`

- [ ] **Step 1: Add a failing behavior-probe assertion**

In `packages/card-support/src/behavior-probe.test.ts`, update the existing test `"runs Counter Event sequences with non-power target restrictions"` to assert the scenario drains decisions:

```ts
expect(report.lines).toContain("Scenario 1 pending decisions: drained");
expect(report.lines).toContain("Scenario 1 effect queue: drained");
expect(report.lines).toContain("Scenario 1 effect resolutions: 1");
```

Run:

```powershell
npm.cmd run test -- packages/card-support/src/behavior-probe.test.ts
```

Expected before probe hardening: fail if the probe still exits early with a pending decision.

- [ ] **Step 2: Remove the Counter scenario early-pass loophole**

In `packages/card-support/src/behavior-probe.ts`, change the `allowBattleRemainder` branch so it only passes when the remaining pending decision is the normal Counter-step pass decision and not an effect-caused decision.

Use this shape:

```ts
if (
  options.allowBattleRemainder === true &&
  state.battle !== undefined &&
  state.effectQueue.length === 0 &&
  state.deferredTriggers.length === 0 &&
  (state.pendingDecision === undefined ||
    (state.pendingDecision.type === "selectCards" &&
      state.pendingDecision.defaultResponse?.type === "cards" &&
      state.pendingDecision.defaultResponse.cards.length === 0))
) {
  return drainResult(
    true,
    state,
    eventCount,
    decisionsResolved,
    effectResolutionCount,
    setupFilterCount,
  );
}
```

If a pending `selectTargets`, `payCost`, `selectCards` from effect runtime, or `chooseEffectOption` remains, the probe must continue draining or fail.

- [ ] **Step 3: Run behavior probe tests**

Run:

```powershell
npm.cmd run test -- packages/card-support/src/behavior-probe.test.ts packages/card-support/src/support-probe.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```powershell
git add packages/card-support/src/behavior-probe.ts packages/card-support/src/behavior-probe.test.ts
git commit -m "test: require counter event probes to drain effect decisions"
```

---

### Task 8: Final Verification And Cleanup

**Files:**
- Any files touched by previous tasks.

- [ ] **Step 1: Run source scans for removed legacy paths**

Run:

```powershell
rg -n "getSupportedCounterEventPower|getSupportedCounterEventRuntime|getSupportedCounterEventSequence|trailingSequence|runtimeEffects|sequenceEffects|counter-event-support|counter-event-power-record|counter-event-target-decision|counter-event-sequence-resolution|counter-event-trailing-sequence|counterPower" packages/engine-core/src packages/card-support/src
```

Expected: no production references. If tests mention these names as anti-regression source scans, those are acceptable only if they assert absence.

- [ ] **Step 2: Run canonical focused tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/battle packages/engine-core/src/runtime packages/card-support/src/behavior-probe.test.ts packages/card-support/src/support-probe.test.ts
```

Expected: pass.

- [ ] **Step 3: Run repo checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
```

Expected: all pass.

- [ ] **Step 4: Run full verify**

Run:

```powershell
npm.cmd run verify
```

Expected: pass.

- [ ] **Step 5: Commit final cleanup if needed**

If Step 1-4 required additional edits:

```powershell
git add packages/engine-core/src packages/card-support/src
git commit -m "chore: verify counter event runtime replacement"
```

If no edits were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan covers full Counter Event replacement, removal of legacy branches/files, power Counter behavior, targeted non-power Counter behavior, printed costs, effect runtime queueing, and behavior-probe hardening.
- Placeholder scan: No `TBD`, `TODO`, or intentionally incomplete steps remain. Task 4 Step 3 gives a concrete extraction checklist for the new helper instead of open-ended placeholder code.
- Type consistency: New APIs consistently use `SupportedCounterEventActivation`, `getSupportedCounterEventActivation`, `getSupportedCounterEventActivations`, and `queueCounterEventEffects`.
- Scope check: This is a single subsystem replacement. It does not include unrelated UI, replay, parser support, or card-specific fixes.
