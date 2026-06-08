# Runtime Queue Results Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/engine-core/src/effect-runtime-queue/results.ts` into cohesive queue-resolution modules while preserving runtime behavior and adding scalability guardrails.

**Architecture:** Keep `results.ts` as the stable factory module for existing callers, but move resolver predicates, quantity lookup, single-entry resolution, and no-choice queue orchestration into private modules under `packages/engine-core/src/effect-runtime-queue/`. Add Phase 4 coverage alongside the decomposition so this slice proves reusable primitive routing instead of only making the file smaller.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, existing `@optcg/engine-core` queue runtime helpers.

---

## Scope

This slice covers Phase 3A plus its required Phase 4 coverage:

- Decompose `packages/engine-core/src/effect-runtime-queue/results.ts`.
- Preserve `createEffectRuntimeQueueResults` as the only public factory exported from `results.ts`.
- Add tests that prove the split preserves queue behavior and that queue support remains primitive-shaped.
- Commit each coherent step.

This slice does not change parser support, probe output, replacement runtime modules, or sequence runtime modules.

## File Structure

Create these private queue modules:

- `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
  - Owns construction of unsupported queue runtime `EngineResult`s.
- `packages/engine-core/src/effect-runtime-queue/quantity-resolution.ts`
  - Owns lookup of resolved `chooseQuantity` decisions from the event journal.
- `packages/engine-core/src/effect-runtime-queue/effect-resolution.ts`
  - Owns effect-definition lookup and body-specific queued effect resolver predicates.
- `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
  - Owns resolving one ordered list of queue entries into mutations, decisions, events, and cleanup.
- `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
  - Owns queue ordering, choice-group handling, accepted optional IDs, and recursive no-choice processing.

Modify these existing files:

- `packages/engine-core/src/effect-runtime-queue/results.ts`
  - Keep as the public assembly point that wires the new private modules together.
- `packages/engine-core/src/effect-runtime-queue/results-types.ts`
  - Add only shared internal type aliases needed by the extracted modules.
- `packages/engine-core/src/package-boundary.test.ts`
  - Add a focused file-size/cohesion guard for the queue results assembly module.
- `packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts`
  - Add cross-product queue behavior coverage.
- `packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts`
  - Add direct tests for quantity decision lookup.
- `packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts`
  - Add direct tests for primitive-shaped queued effect resolution.

## Task 1: Add A Failing Queue Results Cohesion Guard

**Files:**

- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append this test before `async function listProductionSourcePaths`:

```ts
test("effect runtime queue results stays a small assembly module", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-queue/results.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 220,
    `effect-runtime-queue/results.ts should assemble focused modules, not own queue resolution; found ${String(lineCount)} lines`,
  );
});
```

- [ ] **Step 2: Run the new guard and verify it fails**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime queue results stays a small assembly module"
```

Expected: FAIL. The failure message reports that `results.ts` has about 982 lines.

- [ ] **Step 3: Commit nothing**

Do not commit the failing test alone. Keep it staged or unstaged until the implementation makes it pass.

## Task 2: Extract Unsupported Result And Quantity Resolution

**Files:**

- Create: `packages/engine-core/src/effect-runtime-queue/unsupported.ts`
- Create: `packages/engine-core/src/effect-runtime-queue/quantity-resolution.ts`
- Create: `packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results.ts`

- [ ] **Step 1: Write quantity resolution tests**

Create `packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, EngineEventId } from "@optcg/types";

import {
  createActiveState,
  queueDrawForP1,
  toDecisionId,
  toStateSeq,
} from "./test-support.js";
import { resolveQueuedQuantity } from "./quantity-resolution.js";

const decisionResolvedEvent = (
  entryId: string,
  quantity: number,
): EngineEvent => ({
  id: `event:quantity:${entryId}` as EngineEventId,
  seq: 1,
  type: "decisionResolved",
  payload: {
    decisionId: toDecisionId(`decision:chooseQuantity:${entryId}`),
    decisionType: "chooseQuantity",
    responseType: "chooseQuantity",
    quantity,
  },
  visibility: { type: "public" },
  createdAtStateSeq: toStateSeq(1),
});

test("resolveQueuedQuantity reads the latest matching chooseQuantity decision", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  state.eventJournal = [
    decisionResolvedEvent(String(entry.id), 1),
    decisionResolvedEvent(String(entry.id), 2),
  ];

  assert.equal(resolveQueuedQuantity(state, entry, { min: 0, max: 3 }), 2);
});

test("resolveQueuedQuantity rejects out-of-bounds and wrong-decision events", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  state.eventJournal = [
    decisionResolvedEvent("another-entry", 2),
    decisionResolvedEvent(String(entry.id), 4),
  ];

  assert.equal(
    resolveQueuedQuantity(state, entry, { min: 0, max: 3 }),
    undefined,
  );
});
```

- [ ] **Step 2: Run the quantity tests and verify they fail**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts
```

Expected: FAIL because `quantity-resolution.ts` does not exist.

- [ ] **Step 3: Create `unsupported.ts`**

Create `packages/engine-core/src/effect-runtime-queue/unsupported.ts`:

```ts
import type { EngineResult, GameState } from "@optcg/types";

import { toEngineResult } from "../action-results.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./target-decisions.js";

export const createUnsupportedEffectQueueResult = (
  state: GameState,
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      createUnsupportedPendingRuntimeWorkError({
        kind: "effectQueue",
        count: state.effectQueue.length,
      }),
    ],
  );
```

- [ ] **Step 4: Create `quantity-resolution.ts`**

Create `packages/engine-core/src/effect-runtime-queue/quantity-resolution.ts`:

```ts
import type { DecisionId, EffectQueueEntry, GameState } from "@optcg/types";

export const resolveQueuedQuantity = (
  state: GameState,
  entry: EffectQueueEntry,
  bounds: { readonly min: number; readonly max: number },
): number | undefined => {
  const expectedDecisionId =
    `decision:chooseQuantity:${String(entry.id)}` as DecisionId;
  for (let index = state.eventJournal.length - 1; index >= 0; index -= 1) {
    const event = state.eventJournal[index];
    if (event?.type !== "decisionResolved") {
      continue;
    }
    const payload =
      typeof event.payload === "object" && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : undefined;
    if (payload === undefined) {
      continue;
    }
    const decisionId = payload["decisionId"];
    const decisionType = payload["decisionType"];
    const responseType = payload["responseType"];
    const quantity = payload["quantity"];
    if (
      decisionId !== expectedDecisionId ||
      decisionType !== "chooseQuantity" ||
      responseType !== "chooseQuantity" ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < bounds.min ||
      quantity > bounds.max
    ) {
      continue;
    }
    return quantity;
  }
  return undefined;
};
```

- [ ] **Step 5: Replace the local helpers in `results.ts`**

In `packages/engine-core/src/effect-runtime-queue/results.ts`:

- Remove the local `unsupportedEffectQueueResult` function.
- Remove the local `resolveQueuedQuantity` function.
- Import:

```ts
import { resolveQueuedQuantity } from "./quantity-resolution.js";
import { createUnsupportedEffectQueueResult } from "./unsupported.js";
```

- Add this local adapter inside `createEffectRuntimeQueueResults`:

```ts
const unsupportedEffectQueueResult = (state: GameState): EngineResult =>
  createUnsupportedEffectQueueResult(
    state,
    dependencies.createUnsupportedPendingRuntimeWorkError,
  );
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the helper extraction**

Run:

```bash
git add packages/engine-core/src/effect-runtime-queue/unsupported.ts packages/engine-core/src/effect-runtime-queue/quantity-resolution.ts packages/engine-core/src/effect-runtime-queue/quantity-resolution.test.ts packages/engine-core/src/effect-runtime-queue/results.ts
git commit -m "refactor(engine): extract queue quantity resolution"
```

## Task 3: Extract Queued Effect Definition And Primitive Resolvers

**Files:**

- Create: `packages/engine-core/src/effect-runtime-queue/effect-resolution.ts`
- Create: `packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results-types.ts`

- [ ] **Step 1: Write primitive resolver tests**

Create `packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toCardId,
  toEffectId,
} from "./test-support.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import { resolveImplementedDslEffectDefinition } from "../effect-runtime.js";

const createResolvers = () =>
  createQueuedEffectResolvers({ resolveImplementedDslEffectDefinition });

test("queued draw resolver supports the same draw body under two wrappers", () => {
  const wrappers = ["onPlay", "whenAttacking"] as const;

  for (const wrapper of wrappers) {
    const state = createActiveState();
    const entry = queueDrawForP1();
    const supportCard = resolvedCard({
      cardId: entry.source.cardId,
      category: "character",
    });
    const base = reviewedOnPlayDrawDefinition(
      entry.source.cardId,
      supportCard.support,
    );
    const definition: EffectDefinition = {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "draw effect"),
          id: entry.effectBlockId,
          trigger: { type: wrapper },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    };
    setupOnPlayDefinition(
      state,
      must(state.players[p1], "p1").leader,
      definition,
      `def:${wrapper}`,
    );

    const resolved = createResolvers().resolveQueuedDrawEffect(state, entry);

    assert.deepEqual(resolved, { type: "draw", player: "self", count: 1 });
  }
});

test("queued primitive resolvers keep one wrapper reusable across draw and search bodies", () => {
  const state = createActiveState();
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    effectBlockId: toEffectId("OP01-015:auto-on-play-search"),
  };
  const supportCard = resolvedCard({
    cardId: entry.source.cardId,
    category: "character",
  });
  const base = reviewedOnPlayDrawDefinition(
    entry.source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "draw effect"),
        id: entry.effectBlockId,
        trigger: { type: "onPlay" },
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "all",
            shuffleAfter: true,
            filter: { categories: ["character"] },
          },
        },
      },
    ],
  };
  setupOnPlayDefinition(
    state,
    {
      ...must(state.players[p1], "p1").leader,
      cardId: toCardId("OP01-015"),
    },
    definition,
    "def:on-play-search",
  );

  const resolvers = createResolvers();

  assert.equal(resolvers.resolveQueuedDrawEffect(state, entry), undefined);
  assert.equal(
    resolvers.resolveQueuedSearchRevealEffect(state, entry)?.type,
    "search",
  );
});
```

- [ ] **Step 2: Run the primitive resolver tests and verify they fail**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts
```

Expected: FAIL because `effect-resolution.ts` does not exist.

- [ ] **Step 3: Add shared internal dependency type**

In `packages/engine-core/src/effect-runtime-queue/results-types.ts`, add this export after `EffectRuntimeQueueResultsDependencies`:

```ts
export type QueuedEffectDefinitionResolverDependencies = Pick<
  EffectRuntimeQueueResultsDependencies,
  "resolveImplementedDslEffectDefinition"
>;
```

- [ ] **Step 4: Create `effect-resolution.ts`**

Create `packages/engine-core/src/effect-runtime-queue/effect-resolution.ts` by moving these functions out of `results.ts` with the same behavior:

- `resolveQueuedEffectDefinition`
- `canResolveQueuedDrawFromActivateMainEntry`
- `resolveQueuedDrawEffect`
- `resolveQueuedDrawUpToEffect`
- `withoutConditionFields`
- `resolveQueuedContinuousEffect`
- `resolveQueuedSearchRevealEffect`
- `resolveQueuedPlaySourceEffect`

Use this module shell:

```ts
import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "../runtime/continuous/continuous.js";
import {
  isScopedActivateMainQueueEntry,
  isSupportedActivateMainRuntimeEffectBlock,
} from "../runtime/optional-activation/activate-main.js";
import {
  isSupportedQueuedDrawEffectBlock,
  isSupportedQueuedOptionalDrawEffectBlock,
} from "../runtime/primitives/execute.js";
import type { QueuedEffectDefinitionResolverDependencies } from "./results-types.js";

export interface QueuedEffectResolvers {
  readonly resolveQueuedEffectDefinition: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  readonly resolveQueuedDrawEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "draw" }> | undefined;
  readonly resolveQueuedDrawUpToEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "drawUpTo" }> | undefined;
  readonly resolveQueuedContinuousEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) =>
    | Extract<
        Effect,
        {
          type:
            | "modifyPower"
            | "giveKeyword"
            | "setBasePower"
            | "modifyCost"
            | "modifyCounter"
            | "preventDraw"
            | "preventDonActivation"
            | "preventPlay"
            | "invalidateEffects"
            | "giveProtection"
            | "protectFromKO"
            | "cannotBecomeActive"
            | "cannotAttack"
            | "preventBlockerActivation"
            | "cannotBlock";
        }
      >
    | undefined;
  readonly resolveQueuedSearchRevealEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "search" }> | undefined;
  readonly resolveQueuedPlaySourceEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "playSource" }> | undefined;
  readonly withoutConditionFields: (
    effect: EffectDefinition["effects"][number],
  ) => EffectDefinition["effects"][number];
  readonly canResolveQueuedDrawFromActivateMainEntry: (
    effect: EffectDefinition["effects"][number],
    entry: EffectQueueEntry,
  ) => effect is EffectDefinition["effects"][number] & {
    readonly effect: Extract<Effect, { type: "draw" }>;
    readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  };
}

export const createQueuedEffectResolvers = (
  dependencies: QueuedEffectDefinitionResolverDependencies,
): QueuedEffectResolvers => {
  const resolveQueuedEffectDefinition = (
    state: GameState,
    entry: EffectQueueEntry,
  ): EffectDefinition["effects"][number] | undefined => {
    const resolved = state.cardManifest.cards[entry.source.cardId];
    if (resolved === undefined) {
      return undefined;
    }
    const lookup = dependencies.resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return undefined;
    }
    return lookup.definition.effects.find(
      (effect) => effect.id === entry.effectBlockId,
    );
  };

  // Move the remaining resolver functions from results.ts into this factory.

  return {
    resolveQueuedEffectDefinition,
    resolveQueuedDrawEffect,
    resolveQueuedDrawUpToEffect,
    resolveQueuedContinuousEffect,
    resolveQueuedSearchRevealEffect,
    resolveQueuedPlaySourceEffect,
    withoutConditionFields,
    canResolveQueuedDrawFromActivateMainEntry,
  };
};
```

When moving the remaining resolver functions, remove their local copies from `results.ts`.

- [ ] **Step 5: Wire `results.ts` to the resolver factory**

In `results.ts`, import and instantiate:

```ts
import { createQueuedEffectResolvers } from "./effect-resolution.js";

const queuedEffectResolvers = createQueuedEffectResolvers(dependencies);
```

Replace local calls with the resolver object:

- `resolveQueuedEffectDefinition(...)` becomes `queuedEffectResolvers.resolveQueuedEffectDefinition(...)`.
- `resolveQueuedDrawEffect(...)` becomes `queuedEffectResolvers.resolveQueuedDrawEffect(...)`.
- `resolveQueuedDrawUpToEffect(...)` becomes `queuedEffectResolvers.resolveQueuedDrawUpToEffect(...)`.
- `resolveQueuedContinuousEffect(...)` becomes `queuedEffectResolvers.resolveQueuedContinuousEffect(...)`.
- `resolveQueuedSearchRevealEffect(...)` becomes `queuedEffectResolvers.resolveQueuedSearchRevealEffect(...)`.
- `resolveQueuedPlaySourceEffect(...)` becomes `queuedEffectResolvers.resolveQueuedPlaySourceEffect(...)`.
- `withoutConditionFields(...)` becomes `queuedEffectResolvers.withoutConditionFields(...)`.
- `canResolveQueuedDrawFromActivateMainEntry(...)` becomes `queuedEffectResolvers.canResolveQueuedDrawFromActivateMainEntry(...)`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts tests/cards-engine/parser-engine-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the resolver extraction**

Run:

```bash
git add packages/engine-core/src/effect-runtime-queue/effect-resolution.ts packages/engine-core/src/effect-runtime-queue/effect-resolution.test.ts packages/engine-core/src/effect-runtime-queue/results-types.ts packages/engine-core/src/effect-runtime-queue/results.ts
git commit -m "refactor(engine): extract queued effect resolvers"
```

## Task 4: Extract Queue Entry Resolution

**Files:**

- Create: `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts`

- [ ] **Step 1: Add cross-product behavior coverage**

Append this test to `packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts`:

```ts
test("queue entry resolution keeps draw primitive reusable across queued wrappers", () => {
  const cases = [
    { name: "onPlay", trigger: { type: "onPlay" as const } },
    { name: "whenAttacking", trigger: { type: "whenAttacking" as const } },
  ];

  for (const testCase of cases) {
    const state = createActiveState();
    const entry = queueDrawForP1();
    const supportCard = resolvedCard({
      cardId: entry.source.cardId,
      category: "character",
    });
    const base = reviewedOnPlayDrawDefinition(
      entry.source.cardId,
      supportCard.support,
    );
    setupOnPlayDefinition(
      state,
      must(state.players[p1], "p1").leader,
      {
        ...base,
        effects: [
          {
            ...must(base.effects[0], `${testCase.name} draw effect`),
            id: entry.effectBlockId,
            trigger: testCase.trigger,
            sourcePresencePolicy: "mustRemainInSameZone",
          },
        ],
      },
      `def:${testCase.name}:draw`,
    );
    state.effectQueue = [entry];
    const beforeDeck = must(state.players[p1], "p1").deck.length;
    const beforeHand = must(state.players[p1], "p1").hand.length;

    const result = processEffectRuntime(state);

    assert.equal(result.errors, undefined, testCase.name);
    assert.equal(result.state.effectQueue.length, 0, testCase.name);
    assert.equal(
      must(result.state.players[p1], "p1").deck.length,
      beforeDeck - 1,
    );
    assert.equal(
      must(result.state.players[p1], "p1").hand.length,
      beforeHand + 1,
    );
  }
});
```

- [ ] **Step 2: Run the new behavior test**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts -t "queue entry resolution keeps draw primitive reusable across queued wrappers"
```

Expected: PASS before extraction. This is a characterization test; it guards behavior while code moves.

- [ ] **Step 3: Create `entry-resolution.ts`**

Move `resolveQueueEntriesInOrder` from `results.ts` into `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`.

Use this module API:

```ts
import type {
  EffectQueueEntry,
  EngineResult,
  GameState,
  QueueEntryId,
} from "@optcg/types";

import type { EffectRuntimeQueueResultsDependencies } from "./results-types.js";

export interface QueueEntryResolver {
  readonly resolveQueueEntriesInOrder: (
    state: GameState,
    entries: readonly EffectQueueEntry[],
    acceptedOptionalQueueEntryIds?: ReadonlySet<QueueEntryId>,
  ) => EngineResult;
}

export const createQueueEntryResolver = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): QueueEntryResolver => {
  // Move resolveQueueEntriesInOrder from results.ts into this factory.

  return { resolveQueueEntriesInOrder };
};
```

Inside the moved implementation:

- Construct `queuedEffectResolvers` with `createQueuedEffectResolvers(dependencies)`.
- Use `createUnsupportedEffectQueueResult` for unsupported queue results.
- Use `resolveQueuedQuantity` from `quantity-resolution.ts`.
- Keep event ordering, `effectResolved`, rule-processing checkpoint, life-trigger cleanup, and effect-resolved custom-trigger logic unchanged.

- [ ] **Step 4: Wire `results.ts` to `entry-resolution.ts`**

In `results.ts`, instantiate:

```ts
import { createQueueEntryResolver } from "./entry-resolution.js";

const queueEntryResolver = createQueueEntryResolver(dependencies);
```

Replace calls:

```ts
queueEntryResolver.resolveQueueEntriesInOrder(...)
```

Remove the local `resolveQueueEntriesInOrder` implementation from `results.ts`.

- [ ] **Step 5: Run focused queue tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts packages/engine-core/src/effect-runtime-queue/processing-stability.test.ts packages/engine-core/src/effect-runtime-queue/processing-ordering.test.ts packages/engine-core/src/effect-runtime-queue/processing-targets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the entry-resolution extraction**

Run:

```bash
git add packages/engine-core/src/effect-runtime-queue/entry-resolution.ts packages/engine-core/src/effect-runtime-queue/results.ts packages/engine-core/src/effect-runtime-queue/processing-no-choice.test.ts
git commit -m "refactor(engine): extract queue entry resolution"
```

## Task 5: Extract No-Choice Queue Orchestration

**Files:**

- Create: `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`
- Modify: `packages/engine-core/src/effect-runtime-queue/results.ts`

- [ ] **Step 1: Create `no-choice-processing.ts`**

Move `processNoChoiceEffectQueue` and `processEffectRuntimeAfterTriggerOrderChoice` from `results.ts` into `packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts`.

Use this module API:

```ts
import type { EngineResult, GameState, QueueEntryId } from "@optcg/types";

import type { EffectRuntimeQueueResultsDependencies } from "./results-types.js";
import type { QueueEntryResolver } from "./entry-resolution.js";

export interface NoChoiceEffectQueueProcessor {
  readonly processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds?: readonly QueueEntryId[],
  ) => EngineResult;
  readonly processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
}

export const createNoChoiceEffectQueueProcessor = (
  dependencies: EffectRuntimeQueueResultsDependencies,
  queueEntryResolver: QueueEntryResolver,
): NoChoiceEffectQueueProcessor => {
  // Move processNoChoiceEffectQueue and
  // processEffectRuntimeAfterTriggerOrderChoice from results.ts into this factory.

  return {
    processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice,
  };
};
```

Inside the moved implementation:

- Construct `queuedEffectResolvers` with `createQueuedEffectResolvers(dependencies)`.
- Use `queuedEffectResolvers.resolveQueuedEffectDefinition` when checking deferred double-attack damage queues.
- Use `queueEntryResolver.resolveQueueEntriesInOrder` everywhere the old function called `resolveQueueEntriesInOrder`.
- Use `createUnsupportedEffectQueueResult` for unsupported queue results.
- Keep recursive queue processing behavior unchanged.

- [ ] **Step 2: Wire `results.ts` to `no-choice-processing.ts`**

In `results.ts`, instantiate:

```ts
import { createNoChoiceEffectQueueProcessor } from "./no-choice-processing.js";

const queueEntryResolver = createQueueEntryResolver(dependencies);
const noChoiceProcessor = createNoChoiceEffectQueueProcessor(
  dependencies,
  queueEntryResolver,
);
```

Return:

```ts
return {
  processNoChoiceEffectQueue: noChoiceProcessor.processNoChoiceEffectQueue,
  processEffectRuntimeAfterTriggerOrderChoice:
    noChoiceProcessor.processEffectRuntimeAfterTriggerOrderChoice,
  resumePlaySourceOverflowDecision,
};
```

- [ ] **Step 3: Confirm `results.ts` is only assembly**

After this extraction, `results.ts` should contain:

- Imports.
- `createEffectRuntimeQueueResults`.
- `queueEntryResolver` construction.
- `noChoiceProcessor` construction.
- `resumePlaySourceOverflowDecision`.
- The returned `EffectRuntimeQueueResults` object.

It should not contain body-specific primitive support checks, event-journal quantity lookup, ordering recursion, or the queue entry resolution loop.

- [ ] **Step 4: Run the cohesion guard**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime queue results stays a small assembly module"
```

Expected: PASS.

- [ ] **Step 5: Run focused queue tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue
```

Expected: PASS.

- [ ] **Step 6: Commit the no-choice extraction and guard**

Run:

```bash
git add packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts packages/engine-core/src/effect-runtime-queue/results.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract no-choice queue processing"
```

## Task 6: Final Verification For The Slice

**Files:**

- No new files.
- Verify all committed code from Tasks 1-5.

- [ ] **Step 1: Run formatting check**

Run:

```bash
pnpm format:check
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run focused queue tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-queue packages/engine-core/src/package-boundary.test.ts tests/cards-engine/parser-engine-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm verify
```

Expected: PASS.

- [ ] **Step 6: Run coverage because runtime behavior and support-shape tests changed**

Run:

```bash
pnpm coverage
```

Expected: PASS.

- [ ] **Step 7: Inspect final file sizes**

Run:

```bash
wc -l packages/engine-core/src/effect-runtime-queue/results.ts packages/engine-core/src/effect-runtime-queue/effect-resolution.ts packages/engine-core/src/effect-runtime-queue/entry-resolution.ts packages/engine-core/src/effect-runtime-queue/no-choice-processing.ts packages/engine-core/src/effect-runtime-queue/quantity-resolution.ts
```

Expected:

- `results.ts` is at or below 220 lines.
- No new queue module is close to 1000 lines.
- `entry-resolution.ts` may be the largest file, but it owns one concern: resolving selected queue entries.

## Self-Review Checklist

- Spec coverage: This plan implements Phase 3A from the scalable card shape roadmap and includes Phase 4 coverage for cross-wrapper draw reuse plus wrapper/body separation.
- Authority safety: The plan does not add card IDs, shape IDs, parser rule IDs, runtime capability IDs, or generated inventory rows as support authority.
- Boundary safety: `engine-core` remains free of cards, deck hash, Redis, React, browser, WebSocket, Postgres, and HTTP client imports.
- File cohesion: `results.ts` becomes an assembly module; resolver predicates, quantity lookup, entry resolution, and no-choice orchestration move to separate concern owners.
- Verification: The plan requires focused tests, `pnpm verify`, and `pnpm coverage`.
