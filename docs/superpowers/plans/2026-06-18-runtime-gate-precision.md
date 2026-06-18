# Runtime Gate Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop false fail-closed gates from blocking supported current effects because unrelated card metadata or sibling effects look unsupported.

**Architecture:** Keep fail-closed behavior for the exact unsupported operation that is currently resolving, but replace broad whole-card and whole-queue preflight checks with relevance-based checks. Centralize the relevance decisions in small helpers, add parity tests between support admission and live runtime gates, and improve generic queue-gate diagnostics so future failures identify the current entry, trigger, or segment that failed.

**Tech Stack:** TypeScript, Vitest, engine-core runtime queues, effect definitions, play-card support metadata.

---

## File Structure

- Create `packages/engine-core/src/play-card/effect-relevance.ts`
  - Owns play-time effect relevance for Character, Stage, and Event cards.
  - Distinguishes immediate play-time effects from dormant future triggers and user-activated effects.
- Modify `packages/engine-core/src/play-card/support.ts`
  - Uses the relevance helper instead of inspecting every effect block on a playable card.
- Modify `packages/engine-core/src/play-card/support.test.ts`
  - Adds play metadata regressions for dormant future triggers, always-on blocks, and Event Main effects.
- Modify `packages/engine-core/src/play-card/on-play-runtime.test.ts`
  - Keeps live play-card behavior aligned with play metadata support.
- Modify `packages/engine-core/src/runtime/optional-activation/activate-main-trash-play.test.ts`
  - Keeps the current Yamato-style play-from-trash false-gate regression.
- Modify `packages/engine-core/src/runtime-support-gate-parity.test.ts`
  - Adds reusable parity cases proving canonical support admission and sequence/queue preflight agree.
- Modify trigger queueing tests:
  - `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`
- Modify `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
  - Allows unsupported queue errors to include the precise gate context.
- Modify `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
  - Passes current-entry context into unsupported queue errors.
- Modify `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
  - Passes ordering/deferred context into unsupported queue errors.
- Modify `packages/engine-core/src/effect-runtime.ts`
  - Keeps the public unsupported-pending-runtime-work shape but preserves optional detail fields.

## Policy

The engine should fail closed when the current operation is unsupported:

- A current On Play block is unsupported while resolving On Play timing.
- A current On K.O. block is unsupported while resolving On K.O. timing.
- A current sequence segment is unsupported while that segment is being executed.
- A current source-presence policy cannot prove the source is valid.
- A hidden-information, replay, replacement, or ordering case is ambiguous.

The engine should not fail closed because of unrelated metadata:

- A Character being played has an unsupported On K.O. block.
- A Character being played has an unsupported When Attacking block.
- A Stage being played has an unsupported Activate Main block.
- A queued On Play effect has an unrelated sibling On K.O. block.
- A supported queue entry exists beside unrelated dormant effects on the same card.

---

### Task 1: Tighten Play-Time Effect Relevance

**Files:**

- Create: `packages/engine-core/src/play-card/effect-relevance.ts`
- Modify: `packages/engine-core/src/play-card/support.ts`
- Test: `packages/engine-core/src/play-card/support.test.ts`
- Test: `packages/engine-core/src/play-card/on-play-runtime.test.ts`

- [ ] **Step 1: Write failing tests for dormant versus immediate play-time effects**

Add these tests to `packages/engine-core/src/play-card/support.test.ts` near the other `getSupportedPlayMetadata` tests:

```ts
test("getSupportedPlayMetadata rejects unsupported always-on Character blocks but accepts dormant triggers", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "implemented character");
  const implemented = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-character-relevance",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    character.cardId,
    implemented.support,
  );
  const baseEffect = must(definition.effects[0], "base effect");
  state.cardManifest.cards[character.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;

  state.cardManifest.effectDefinitions = {
    "def-character-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:future-on-ko` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };
  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });

  state.cardManifest.effectDefinitions = {
    "def-character-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:unsupported-permanent` as EffectDefinition["effects"][number]["id"],
          category: "permanent",
          trigger: { type: "permanent" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "custom", name: "unsupported-permanent" },
        },
      ],
    },
  };
  assert.equal(getSupportedPlayMetadata(state, character), null);
});

test("getSupportedPlayMetadata accepts dormant Stage activations but rejects unsupported Stage On Play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "implemented stage");
  const implemented = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-stage-relevance",
    },
  });
  const definition = reviewedOnPlayDrawDefinition(
    stage.cardId,
    implemented.support,
  );
  const baseEffect = must(definition.effects[0], "base effect");
  state.cardManifest.cards[stage.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;

  state.cardManifest.effectDefinitions = {
    "def-stage-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:stage-activate` as EffectDefinition["effects"][number]["id"],
          category: "activate",
          trigger: { type: "activateMain" },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "custom", name: "unsupported-stage-activation" },
        },
      ],
    },
  };
  assert.deepEqual(getSupportedPlayMetadata(state, stage), {
    category: "stage",
    printedCost: 2,
  });

  state.cardManifest.effectDefinitions = {
    "def-stage-relevance": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: `${String(baseEffect.id)}:unsupported-on-play` as EffectDefinition["effects"][number]["id"],
          trigger: { type: "onPlay" },
          effect: { type: "custom", name: "unsupported-stage-on-play" },
        },
      ],
    },
  };
  assert.equal(getSupportedPlayMetadata(state, stage), null);
});
```

- [ ] **Step 2: Run tests and verify the always-on Character case fails on current code**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/play-card/support.test.ts
```

Expected before implementation: at least one new assertion fails because current play support does not distinguish dormant triggers from always-on unsupported blocks precisely enough.

- [ ] **Step 3: Add the play relevance helper**

Create `packages/engine-core/src/play-card/effect-relevance.ts`:

```ts
import type { EffectDefinition, ResolvedCard } from "@optcg/types";

type EffectBlock = EffectDefinition["effects"][number];

const isOnPlayBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "onPlay";

const isAlwaysOnBlock = (effect: EffectBlock): boolean =>
  effect.category === "permanent" || effect.category === "replacement";

const isMainEventBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "main";

export const playRelevantEffectBlocks = (
  category: ResolvedCard["category"],
  effects: readonly EffectBlock[],
): EffectBlock[] => {
  if (category === "event") {
    return effects.filter(isMainEventBlock);
  }
  if (category === "character" || category === "stage") {
    return effects.filter(
      (effect) => isOnPlayBlock(effect) || isAlwaysOnBlock(effect),
    );
  }
  return [];
};
```

- [ ] **Step 4: Use the relevance helper in play support**

Modify `packages/engine-core/src/play-card/support.ts` imports:

```ts
import { playRelevantEffectBlocks } from "./effect-relevance.js";
```

Replace the Character, Event, and Stage definition scans with:

```ts
const relevantEffects = playRelevantEffectBlocks(
  resolved.category,
  lookup.definition.effects,
);
```

For Characters:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: false },
  )
) {
  return null;
}
```

For Events:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: true },
  )
) {
  return null;
}
```

For Stages:

```ts
if (
  !hasOnlySupportedRelevantEffects(
    relevantEffects,
    isDefinitionRuntimeAdmittedEffect,
    { requireAtLeastOne: false },
  )
) {
  return null;
}
```

- [ ] **Step 5: Run play-card tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/play-card/support.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/engine-core/src/play-card/effect-relevance.ts packages/engine-core/src/play-card/support.ts packages/engine-core/src/play-card/support.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts
git commit -m "Clarify play-time effect gate relevance"
```

---

### Task 2: Add Trigger-Queue Sibling Relevance Regressions

**Files:**

- Modify: `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/on-play.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/main-event.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/attack.ts`
- Potential implementation target: `packages/engine-core/src/runtime/trigger-queueing/ko.ts`

- [ ] **Step 1: Add On Play sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts`, add:

```ts
test("On Play queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const definition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(definition.effects[0], "onPlay effect");
  setupOnPlayDefinition(
    state,
    played,
    {
      ...definition,
      effects: [
        onPlayEffect,
        {
          ...onPlayEffect,
          id: `${String(onPlayEffect.id)}:unsupported-on-ko` as typeof onPlayEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
    "def-on-play-with-dormant-on-ko",
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.effectQueue[0]?.effectBlockId, onPlayEffect.id);
});
```

- [ ] **Step 2: Add Main Event sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts`, add:

```ts
test("Main Event queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state } = setupMainEventQueueingState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-main-event-draw"],
    "main event definition",
  );
  const mainEffect = must(definition.effects[0], "main effect");
  state.cardManifest.effectDefinitions = {
    "def-main-event-draw": {
      ...definition,
      effects: [
        mainEffect,
        {
          ...mainEffect,
          id: `${String(mainEffect.id)}:unsupported-on-ko` as typeof mainEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.effectQueue[0]?.effectBlockId, mainEffect.id);
});
```

- [ ] **Step 3: Add attack timing sibling tests**

In `packages/engine-core/src/runtime/trigger-queueing/attack.test.ts`, add two tests:

```ts
test("When Attacking queueing ignores unsupported dormant On K.O. sibling", () => {
  const { state, definition } = attackQueueingState();
  const whenAttackingEffect = must(
    definition.effects[0],
    "whenAttacking effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-when-attacking": {
      ...definition,
      effects: [
        whenAttackingEffect,
        {
          ...whenAttackingEffect,
          id: `${String(whenAttackingEffect.id)}:unsupported-on-ko` as typeof whenAttackingEffect.id,
          trigger: { type: "onKO" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    result.state.effectQueue[0]?.effectBlockId,
    whenAttackingEffect.id,
  );
});

test("On Opponent Attack queueing ignores unsupported dormant On Play sibling", () => {
  const { state, definition } = opponentAttackQueueingState();
  const onOpponentAttackEffect = must(
    definition.effects[0],
    "onOpponentAttack effect",
  );
  state.cardManifest.effectDefinitions = {
    "def-on-opponent-attack": {
      ...definition,
      effects: [
        onOpponentAttackEffect,
        {
          ...onOpponentAttackEffect,
          id: `${String(onOpponentAttackEffect.id)}:unsupported-on-play` as typeof onOpponentAttackEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = processDefenderOpponentAttackTiming(state);

  assert.equal(result.errors, undefined);
  const queuedEvent = result.events.find(
    (event) => event.type === "effectQueued",
  );
  const payload = queuedEvent?.payload as
    | { effectBlockId?: unknown }
    | undefined;
  assert.equal(payload?.effectBlockId, onOpponentAttackEffect.id);
});
```

- [ ] **Step 4: Add On K.O. sibling test**

In `packages/engine-core/src/runtime/trigger-queueing/ko.test.ts`, add:

```ts
test("On K.O. queueing ignores unsupported dormant On Play sibling", () => {
  const { state, source, definition, events } = koQueueingState();
  const onKOEffect = must(definition.effects[0], "onKO effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-on-ko": {
      ...definition,
      effects: [
        onKOEffect,
        {
          ...onKOEffect,
          id: `${String(onKOEffect.id)}:unsupported-on-play` as typeof onKOEffect.id,
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
          cost: { type: "restDon", count: 1 },
        },
      ],
    },
  };

  const result = detectBattleKOTriggerCandidates(state, events);

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  const candidate = must(result.candidates[0], "On K.O. candidate");
  assert.equal(candidate.effectBlockId, onKOEffect.id);
  assert.equal(candidate.source.instanceId, source.instanceId);
});
```

- [ ] **Step 5: Run trigger queueing tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/runtime/trigger-queueing/on-play.test.ts packages/engine-core/src/runtime/trigger-queueing/main-event.test.ts packages/engine-core/src/runtime/trigger-queueing/attack.test.ts packages/engine-core/src/runtime/trigger-queueing/ko.test.ts
```

Expected: tests pass, or fail only where an adapter is using a broad sibling gate.

- [ ] **Step 6: Fix any failing adapter by filtering current-timing candidates before support checks**

For each failing adapter, preserve this shape:

```ts
const currentTimingEffects = lookup.definition.effects.filter((effect) =>
  isAutoRuntimeTriggerCandidate(effect, adapterForThisTiming),
);
const supportedCurrentTimingEffects = currentTimingEffects.filter((effect) =>
  isSupportedAutoRuntimeEffectBlock(effect, adapterForThisTiming),
);
if (supportedCurrentTimingEffects.length !== currentTimingEffects.length) {
  return toEngineResult(
    state,
    [],
    [queueingError("unsupported-current-timing-definition")],
    options,
  );
}
```

Do not inspect unrelated `lookup.definition.effects` for this decision.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/engine-core/src/runtime/trigger-queueing
git commit -m "Test trigger gates ignore dormant siblings"
```

---

### Task 3: Strengthen Runtime Support Parity Tests

**Files:**

- Modify: `packages/engine-core/src/runtime-support-gate-parity.test.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-admission.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-queue/effect-resolution.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/basic.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/costs.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/field.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
- Potential implementation target: `packages/engine-core/src/effect-runtime-sequence/support/continuous.ts`

- [ ] **Step 1: Add a reusable parity helper**

In `packages/engine-core/src/runtime-support-gate-parity.test.ts`, add below `syntheticEntry`:

```ts
const assertAdmissionAndSequencePreflightAgree = (
  name: string,
  block: EffectDefinition["effects"][number],
  entry: EffectQueueEntry = syntheticEntry(block.sourcePresencePolicy),
): void => {
  const admission = evaluateEffectBlockRuntimeSupport(block);
  const sequenceBlock = toSupportedSequenceBlock(entry, block);
  assert.equal(
    sequenceBlock !== undefined,
    admission.supported,
    `${name}: admission.supported=${String(
      admission.supported,
    )} sequenceBlock=${String(sequenceBlock !== undefined)}`,
  );
};
```

- [ ] **Step 2: Add supported block cases**

Add this table and test:

```ts
const supportedSequenceParityCases: readonly {
  readonly name: string;
  readonly block: EffectDefinition["effects"][number];
}[] = [
  {
    name: "conditioned optional DON attach sequence",
    block: conditionedOptionalDonAttachBlock(),
  },
  {
    name: "draw then trash hand sequence",
    block: {
      ...conditionedOptionalDonAttachBlock(),
      id: "runtime-support-gate-parity-draw-trash" as EffectDefinition["effects"][number]["id"],
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 2, player: "self" },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              count: 1,
              min: 1,
              player: "self",
              chooser: "self",
            },
          },
        ],
      },
    },
  },
];

for (const testCase of supportedSequenceParityCases) {
  test(`canonical support and sequence preflight agree for ${testCase.name}`, () => {
    assertAdmissionAndSequencePreflightAgree(testCase.name, testCase.block);
  });
}
```

- [ ] **Step 3: Replace duplicate one-off assertions with the helper**

Update existing tests in the file:

```ts
test("canonical support and sequence execution preflight agree for conditioned sequence blocks", () => {
  assertAdmissionAndSequencePreflightAgree(
    "conditioned sequence",
    conditionedOptionalDonAttachBlock(),
  );
});
```

- [ ] **Step 4: Run parity tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/runtime-support-gate-parity.test.ts
```

Expected: all parity tests pass. If a supported block fails sequence preflight, adjust the narrower preflight helper so it accepts the same primitive evidence as canonical admission.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/runtime-support-gate-parity.test.ts packages/engine-core/src/effect-runtime-admission.ts packages/engine-core/src/effect-runtime-sequence packages/engine-core/src/effect-runtime-queue
git commit -m "Add runtime gate parity coverage"
```

---

### Task 4: Add Precise Unsupported Queue Diagnostics

**Files:**

- Modify: `packages/engine-core/src/effect-runtime.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
- Test: `packages/engine-core/src/effect-runtime-queue/pending-work.test.ts`
- Test: `packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts`

- [ ] **Step 1: Extend unsupported work details**

In `packages/engine-core/src/effect-runtime.ts`, change `UnsupportedPendingRuntimeWorkDetails` to:

```ts
export interface UnsupportedPendingRuntimeWorkDetails extends PendingRuntimeWork {
  reason: "unsupported-pending-runtime-work";
  gate?:
    | "queue-ordering"
    | "queue-entry-resolution"
    | "queue-source-presence"
    | "queue-effect-definition"
    | "deferred-trigger-release";
  queueEntryId?: string;
  effectId?: string;
  queueReason?: string;
}
```

Update `unsupportedPendingRuntimeWorkError` so it preserves optional fields:

```ts
const unsupportedPendingRuntimeWorkError = (
  work: PendingRuntimeWork & Partial<UnsupportedPendingRuntimeWorkDetails>,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: unsupportedEffectIdByKind[work.kind],
  details: {
    reason: "unsupported-pending-runtime-work",
    kind: work.kind,
    count: work.count,
    ...(work.gate === undefined ? {} : { gate: work.gate }),
    ...(work.queueEntryId === undefined
      ? {}
      : { queueEntryId: work.queueEntryId }),
    ...(work.effectId === undefined ? {} : { effectId: work.effectId }),
    ...(work.queueReason === undefined
      ? {}
      : { queueReason: work.queueReason }),
  } satisfies UnsupportedPendingRuntimeWorkDetails,
});
```

- [ ] **Step 2: Allow queue unsupported helper to accept context**

In `packages/engine-core/src/effect-runtime-queue/unsupported.ts`, replace the function with:

```ts
import type { EffectQueueEntry, EngineResult, GameState } from "@optcg/types";

import { type EngineResultOptions, toEngineResult } from "../action-results.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export interface UnsupportedEffectQueueContext {
  readonly gate:
    | "queue-ordering"
    | "queue-entry-resolution"
    | "queue-source-presence"
    | "queue-effect-definition"
    | "deferred-trigger-release";
  readonly entry?: EffectQueueEntry;
  readonly exposeEntryIdentity?: boolean;
  readonly queueReason?: string;
}

export const createUnsupportedEffectQueueResult = (
  state: GameState,
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError,
  options: EngineResultOptions = {},
  context?: UnsupportedEffectQueueContext,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      createUnsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
        ...(context?.gate === undefined ? {} : { gate: context.gate }),
        ...(context?.entry === undefined || context.exposeEntryIdentity !== true
          ? {}
          : {
              queueEntryId: String(context.entry.id),
              effectId: String(context.entry.effectBlockId),
            }),
        ...(context?.queueReason === undefined
          ? {}
          : { queueReason: context.queueReason }),
      }),
    ],
    options,
  );
```

- [ ] **Step 3: Pass entry-resolution context**

In `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`, replace the local helper with:

```ts
const unsupportedEffectQueueResult = (
  state: GameState,
  context?: Parameters<typeof createUnsupportedEffectQueueResult>[3],
): EngineResult =>
  createUnsupportedEffectQueueResult(
    state,
    dependencies.createUnsupportedPendingRuntimeWorkError,
    options,
    context,
  );
```

For source presence failures:

```ts
return unsupportedEffectQueueResult(originalState, {
  gate: "queue-source-presence",
  entry: selected,
  exposeEntryIdentity: false,
  queueReason: "source-presence-failed",
});
```

For missing unsupported body resolution:

```ts
return unsupportedEffectQueueResult(originalState, {
  gate: "queue-entry-resolution",
  entry: selectedForBodyResolution,
  exposeEntryIdentity: selectedForBodyResolution.source.zone?.zone !== "life",
  queueReason: "unsupported-body",
});
```

- [ ] **Step 4: Pass ordering context**

In `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`, update unsupported ordering calls:

```ts
if (!ordering.ok) {
  return unsupportedEffectQueueResult(state, options, {
    gate: "queue-ordering",
    queueReason: "invalid-ordering",
  });
}
```

If the local helper signature differs, update it to accept and forward `UnsupportedEffectQueueContext`.

- [ ] **Step 5: Add diagnostics tests**

In `packages/engine-core/src/effect-runtime-queue/pending-work.test.ts`, add:

```ts
test("unsupported queue errors include current gate context when available", () => {
  const state = createActiveState();
  state.effectQueue.push(queuedEffect());

  const result = processEffectRuntime(state);

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.errors?.[0]?.effectId, "unsupported-effect-queue");
  assert.equal(
    (result.errors?.[0] as { details?: { gate?: string } }).details?.gate,
    "queue-entry-resolution",
  );
  assert.equal(
    JSON.stringify(result.errors).includes("hidden-effect-block"),
    false,
  );
});
```

- [ ] **Step 6: Run queue diagnostics tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/effect-runtime-queue/pending-work.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
```

Expected: all tests pass and existing assertions that only check `reason`, `kind`, and `count` still pass because the new fields are additive.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime.ts packages/engine-core/src/effect-runtime-queue/unsupported.ts packages/engine-core/src/effect-runtime-queue/entry-resolution.ts packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts packages/engine-core/src/effect-runtime-queue/pending-work.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
git commit -m "Add precise unsupported queue diagnostics"
```

---

### Task 5: Audit Pending Runtime Gates That Block Supported Work

**Files:**

- Modify: `packages/engine-core/src/actions.ts`
- Modify: `packages/engine-core/src/battle/actions.ts`
- Modify: `packages/engine-core/src/battle/resolution.ts`
- Modify: `packages/engine-core/src/battle/block-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-actions.ts`
- Modify: `packages/engine-core/src/battle/counter-card-use.ts`
- Modify: `packages/engine-core/src/battle/damage-step-continuation.ts`
- Test: use nearest existing tests in `packages/engine-core/src/actions*.test.ts` and `packages/engine-core/src/battle/*.test.ts`

- [ ] **Step 1: Add an actions-level supported-runtime-work regression**

In `packages/engine-core/src/actions-pending-decision.test.ts`, change the existing effect-runtime import from:

```ts
import { createChooseQuantityDecisionForQueuedEffect } from "./effect-runtime.js";
```

to:

```ts
import {
  createChooseQuantityDecisionForQueuedEffect,
  processEffectRuntime,
} from "./effect-runtime.js";
```

Add this test near the existing pending-runtime tests:

```ts
test("supported pending runtime work settles before generic action gates", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  state.effectQueue = [queueDrawForP1()];

  const runtime = processEffectRuntime(state);

  assert.equal(runtime.errors, undefined);
  assert.equal(runtime.state.effectQueue.length, 0);
  assert.equal(runtime.state.pendingDecision, undefined);
});
```

- [ ] **Step 2: Classify each `detectPendingRuntimeWork` caller**

For each caller, add a one-line comment only when the gate is intentionally legal-action suppression rather than runtime resolution:

```ts
// Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
```

Do not add comments to obvious runtime-processing calls.

- [ ] **Step 3: Replace false action hard-stops with runtime continuation**

When a caller returns an unsupported or illegal result only because `detectPendingRuntimeWork(state) !== undefined`, use `continueRuntimeUntilIdle` if the state came from a just-completed supported action or decision.

Use this shape:

```ts
const continued = continueRuntimeUntilIdle(
  state,
  toEngineResult(state, [], undefined, options),
  options,
);
if (
  continued.errors !== undefined ||
  continued.state.pendingDecision !== undefined
) {
  return continued;
}
```

Do not run runtime continuation before user phase actions from arbitrary states; that remains legal-action suppression.

- [ ] **Step 4: Run action and battle tests**

Run:

```bash
corepack pnpm vitest run packages/engine-core/src/actions-pending-decision.test.ts packages/engine-core/src/battle
```

Expected: all tests pass. Any changed behavior must show that supported runtime work now settles before generic gates appear.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/actions.ts packages/engine-core/src/battle packages/engine-core/src/actions-pending-decision.test.ts
git commit -m "Settle supported runtime work before action gates"
```

---

### Task 6: Add Support Probe and Live Runtime Gate Parity

**Files:**

- Modify: `packages/card-support/src/support-probe.test.ts`
- Modify: `packages/engine-core/src/real-card-dsl-runtime.test.ts`
- Modify when report labels need current-entry wording: `packages/card-support/src/support-probe-report.ts`

- [ ] **Step 1: Add probe output assertion for current-entry support**

In `packages/card-support/src/support-probe.test.ts`, add a text-only probe case for:

```ts
const text =
  "[Activate: Main] You may trash this Character: Play up to 1 black [Yamato] with a cost of 8 from your trash.";
```

Assert parser support and runtime support both report the activate-main sequence primitives:

```ts
expect(report.lines).toContain("Line 1 primitive parser: passed");
expect(report.lines).toEqual(
  expect.arrayContaining([
    expect.stringContaining("parser entryPoint:activateMain"),
    expect.stringContaining("parser cost:trashSelf"),
    expect.stringContaining("parser body:playSelected"),
    expect.stringContaining("runtime body:sequence"),
  ]),
);
```

- [ ] **Step 2: Add live runtime parity fixture**

In `packages/engine-core/src/real-card-dsl-runtime.test.ts`, update these imports:

```ts
import type {
  CardId,
  CardInstance,
  MatchCardManifest,
  SelectionId,
} from "@optcg/types";

import { must, p1, p2, resolvedCard } from "./action-test-fixtures.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toEffectId,
} from "./action-dispatcher-test-support.js";
import {
  reviewedOnPlayDrawDefinition,
  targetSelectionQueueState,
} from "./effect-runtime-queue/test-support.js";
```

Add this helper below `toCardId`:

```ts
const setupActivateMainTrashSelfPlayFromTrashState = (): {
  effectId: ReturnType<typeof toEffectId>;
  source: CardInstance;
  state: ReturnType<typeof makeMainPhaseLegalActionState>;
  trashTarget: CardInstance;
} => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source character");
  source.cardId = toCardId("self-trash-source");
  const effectId = toEffectId("activate-main-self-trash-play-yamato");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: source.cardId,
    category: "character",
    definitionId: "def-activate-main-self-trash-play-yamato",
    effectId,
  });
  const trashSelectionId = "trashSelection:yamato" as SelectionId;
  const effectBlock = must(definition.effects[0], "activate effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "pay-trash-self",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "trashSelf", optional: true },
        },
      },
      {
        id: "select-yamato-from-trash",
        connector: "ifYouDo",
        saveResultAs: trashSelectionId,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          filter: {
            categories: ["character"],
            names: ["Yamato"],
            colorsAny: ["black"],
            cost: { op: "eq", value: 8 },
          },
          saveAs: trashSelectionId,
          visibility: "bothPlayers",
        },
      },
      {
        id: "play-selected-yamato",
        connector: "ifPossible",
        effect: {
          type: "playSelected",
          selection: trashSelectionId,
          ignoreCost: true,
        },
      },
    ],
  };

  const trashTarget = {
    ...must(p1State.deck[0], "trash Yamato"),
    cardId: toCardId("black-yamato-eight"),
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index: 0,
    },
  };
  p1State.deck = p1State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = [trashTarget];

  const yamatoSupport = {
    cardId: trashTarget.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    effectDefinitionId: "def-yamato-on-play-draw",
    rulesVersion: "activate-main-trash-play-parity-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "activate-main-trash-play-parity-source",
    behaviorHash: "activate-main-trash-play-parity-behavior",
  };
  const yamatoCard = resolvedCard({
    cardId: trashTarget.cardId,
    category: "character",
    cost: 8,
    power: 8000,
    support: yamatoSupport,
  });
  state.cardManifest.cards[trashTarget.cardId] = {
    ...yamatoCard,
    colors: ["black"],
    name: "Yamato",
  };
  const yamatoDefinition = reviewedOnPlayDrawDefinition(
    trashTarget.cardId,
    yamatoSupport,
  );
  const yamatoBaseEffect = must(yamatoDefinition.effects[0], "Yamato effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [yamatoSupport.effectDefinitionId]: {
      ...yamatoDefinition,
      effects: [
        {
          ...yamatoBaseEffect,
          id: toEffectId("yamato-on-play-draw"),
          trigger: { type: "onPlay" },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };

  return { effectId, source, state, trashTarget };
};
```

Add this test that uses the helper and asserts the live engine does not produce `unsupported-effect-queue`:

```ts
test("probe-supported activate-main trash play from trash does not hit generic runtime gates", () => {
  const { effectId, source, state, trashTarget } =
    setupActivateMainTrashSelfPlayFromTrashState();

  const activated = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId,
  });
  const trashSelfDecision = must(
    activated.state.pendingDecision,
    "trash-self decision",
  );
  const paid = applyAction(activated.state, {
    type: "respondToDecision",
    decisionId: trashSelfDecision.id,
    response: { type: "payment", optionId: "trashSelf" },
  });
  const selection = must(paid.state.pendingDecision, "trash selection");
  assert.equal(selection.type, "selectCards");

  const selected = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: selection.id,
    response: {
      type: "cards",
      cards: selection.candidates.map((candidate) => candidate.card),
    },
  });

  assert.equal(selected.errors, undefined);
  assert.equal(
    must(selected.state.players[p1], "p1").characters.some(
      (card) => card.instanceId === trashTarget.instanceId,
    ),
    true,
  );
});
```

- [ ] **Step 3: Run probe and runtime parity tests**

Run:

```bash
corepack pnpm vitest run packages/card-support/src/support-probe.test.ts packages/engine-core/src/real-card-dsl-runtime.test.ts
```

Expected: both pass and no live runtime path emits `unsupported-effect-queue` for the supported activate-main sequence.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/card-support/src/support-probe.test.ts packages/engine-core/src/real-card-dsl-runtime.test.ts packages/card-support/src/support-probe-report.ts
git commit -m "Check probe support against live runtime gates"
```

---

### Task 7: Final Verification and Push

**Files:**

- No production files changed in this task.

- [ ] **Step 1: Run format check**

Run:

```bash
corepack pnpm run format:check
```

Expected: Prettier reports all files formatted.

- [ ] **Step 2: Run lint**

Run:

```bash
corepack pnpm run lint
```

Expected: ESLint exits successfully with zero warnings.

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm run typecheck
```

Expected: all package TypeScript projects compile with `--noEmit`.

- [ ] **Step 4: Run root tests**

Run:

```bash
corepack pnpm run test
```

Expected: all non-contract Vitest tests pass.

- [ ] **Step 5: Run contracts if runtime DSL shape changed**

Run:

```bash
corepack pnpm run contracts
```

Expected: contracts compile, effect fixtures validate, schema validates, package types sync check passes, and contract tests pass.

- [ ] **Step 6: Push after user approval**

Run:

```bash
git push origin HEAD:dev
```

Expected: branch pushes cleanly to `origin/dev`.

---

## Self-Review

- Spec coverage: The plan targets the clarified problem: supported current effects blocked by coarse gates. It covers play-card preflight, trigger queue sibling relevance, admission/preflight parity, generic queue diagnostics, pending runtime action gates, and probe/runtime parity.
- Placeholder scan: The plan contains concrete code snippets for the tests, imports, and setup functions that matter most; no task depends on a missing code snippet or card-specific allowlist.
- Type consistency: New API names are consistent: `playRelevantEffectBlocks`, `UnsupportedEffectQueueContext`, and `assertAdmissionAndSequencePreflightAgree`.
- Scope check: This is one subsystem: engine runtime gate precision. It intentionally does not broaden into parser feature work or client UI behavior.
