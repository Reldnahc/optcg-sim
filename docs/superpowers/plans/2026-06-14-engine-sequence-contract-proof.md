# Engine Sequence Contract Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the engine sequence saved-result boundary with a reusable producer/consumer contract matrix, so parser output can be checked against engine semantics instead of one narrow DON attachment path.

**Architecture:** Create an engine-owned saved-result contract layer that classifies sequence producers and validates sequence consumers in one place. Add engine-core tests that cover producer kinds, consumer requirements, mismatch rejection, nested sequence flattening, and runtime ledger behavior. Add parser integration tests only after the engine contract is proven.

**Tech Stack:** TypeScript, Vitest, `@optcg/types`, `@optcg/engine-core`, `@optcg/cards`, `npm.cmd`/pnpm scripts.

---

## Scope

This replaces the narrower `2026-06-14-explicit-sequence-save-result-kind.md` plan. The old plan should be removed from the branch and not executed.

This plan proves the engine boundary for saved-result producers and consumers:

- selected card producers: `selectCards`, cost-area DON via `selectTargets`, `selectFromSet`, `revealTop`
- selected target producers: `selectTargets`, `selectAllTargets`, `forEachSavedTarget`, produced objects from trigger context
- paid-cost producers: `payCost`
- scalar producers: `chooseNumber`
- selected card consumers: `moveSelected`, `attachSelectedDon`, `playSelected`, `revealSelected`, selected-card movement helpers
- selected target consumers: `savedFieldObject`, `ownerConstraint`, `forEachSavedTarget`
- set/number consumers: `selectFromSet`, `placeSetRemainder`, stat comparisons using `savedNumber`

Parser changes come last and only assert that representative parser output lands on the proven engine contract.

---

## File Structure

- Create `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
  - Engine-owned static contract for sequence saved-result producers and consumers.
  - No parser imports.
  - Exports small classification and validation helpers used by `support.ts`.

- Modify `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
  - Keep selection-shape helpers, but move cross-segment saved-result contract decisions to `save-result-contract.ts`.

- Modify `packages/engine-core/src/effect-runtime-sequence/support.ts`
  - Replace scattered `savedSelectedCards`, `savedSelectionSets`, `savedNumbers`, and `savedSelectedTargets` mutation logic with calls to the contract helper.
  - Keep sequence orchestration here.

- Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`
  - Static support matrix tests.
  - These tests prove support admits valid producer/consumer paths and rejects mismatches.

- Create `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts`
  - Runtime execution tests for representative paths.
  - These tests prove frame ledgers and saved references actually line up with static support.

- Modify `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`
  - Keep the existing regression, but it becomes one case in the broader matrix.

- Modify `packages/types/src/effects.ts`
  - Add optional explicit `saveResultKind` segment metadata only if the engine contract tests prove it is useful.
  - This metadata is segment-level, not inner-effect-level.

- Modify `packages/types/src/effects.test.ts`
  - Type tests for `saveResultKind`, if Task 4 adds it.

- Modify parser tests only after engine proof:
  - `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`

---

## Shared Commit Rule

Before every commit step:

```powershell
git status --short --branch
```

Only stage the files listed in that task. If unrelated files are dirty, leave them alone. If a listed file contains unrelated user changes, inspect the diff and stage only the owned hunks with `git add -p`.

---

### Task 1: Remove The Narrow Plan

**Files:**

- Delete: `docs/superpowers/plans/2026-06-14-explicit-sequence-save-result-kind.md`
- Create: `docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md`

- [ ] **Step 1: Confirm the narrow plan is gone**

Run:

```powershell
Test-Path docs/superpowers/plans/2026-06-14-explicit-sequence-save-result-kind.md
```

Expected: `False`.

- [ ] **Step 2: Confirm this replacement plan exists**

Run:

```powershell
Test-Path docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md
```

Expected: `True`.

- [ ] **Step 3: Commit only the plan replacement**

Run:

```powershell
git status --short --branch
git add docs/superpowers/plans/2026-06-14-explicit-sequence-save-result-kind.md docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md
git commit -m "Replace narrow save result plan with engine proof plan"
```

---

### Task 2: Add Static Contract Matrix Tests First

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support.ts` only after the RED step

- [ ] **Step 1: Write the failing matrix test file**

Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "save-result-contract-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "save-result-contract-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:leader" as EffectQueueEntry["source"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId: "p1:leader" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "leader",
    },
    category: "leader",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId:
    "save-result-contract-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "save-result-contract-test" },
});

const block = (
  effects: EffectDefinition["effects"][number]["effect"] extends infer E
    ? E extends { type: "sequence"; effects: infer S }
      ? S
      : never
    : never,
): EffectDefinition["effects"][number] => ({
  id: "save-result-contract-effect" as EffectDefinition["effects"][number]["id"],
  category: "auto",
  trigger: { type: "onPlay" },
  optional: false,
  oncePerTurn: false,
  sourcePresencePolicy: "mustRemainInSameZone",
  effect: { type: "sequence", effects },
});

const assertSupported = (effectBlock: EffectDefinition["effects"][number]) => {
  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
};

const assertUnsupported = (
  effectBlock: EffectDefinition["effects"][number],
) => {
  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), false);
};

test("contract supports hand selectedCards producer consumed by moveSelected", () => {
  const selection = "handSelection" as SelectionId;
  assertSupported(
    block([
      {
        connector: "always",
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "self",
          chooser: "self",
          min: 1,
          max: 1,
          saveAs: selection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "then",
        effect: {
          type: "moveSelected",
          selection,
          from: "hand",
          to: "deck",
          position: "bottom",
        },
      },
    ]),
  );
});

test("contract rejects hand selectedCards producer consumed as DON attachment", () => {
  const selection = "handSelection" as SelectionId;
  const targetSelection = "targetSelection";
  assertUnsupported(
    block([
      {
        connector: "always",
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "self",
          chooser: "self",
          min: 1,
          max: 1,
          saveAs: selection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "then",
        saveResultAs: targetSelection,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"] },
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection,
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: targetSelection,
            },
            zone: "leaderArea",
            player: "self",
            filter: { categories: ["leader"] },
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ]),
  );
});

test("contract supports costArea DON selectTargets producer consumed by attachSelectedDon", () => {
  const selection = "donSelection" as SelectionId;
  const targetSelection = "targetSelection";
  assertSupported(
    block([
      {
        connector: "always",
        saveResultAs: selection,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "anyPlayer",
            zone: "costArea",
            filter: { categories: ["don"] },
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      {
        connector: "ifYouDo",
        saveResultAs: targetSelection,
        effect: {
          type: "selectTargets",
          ownerConstraint: { type: "sameAsSavedReferenceOwner", selection },
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "anyPlayer",
            zones: ["leaderArea", "characterArea"],
            filter: { categories: ["leader", "character"] },
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection,
          targetOwner: "selectedDonOwner",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: targetSelection,
            },
            zones: ["leaderArea", "characterArea"],
            player: "anyPlayer",
            filter: { categories: ["leader", "character"] },
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ]),
  );
});

test("contract supports revealTop set producer consumed by selectFromSet and playSelected", () => {
  const set = "revealedSet";
  const selection = "setSelection" as SelectionId;
  assertSupported(
    block([
      {
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 5,
          saveAs: set,
          visibility: "bothPlayers",
        },
      },
      {
        connector: "then",
        effect: {
          type: "selectFromSet",
          set,
          chooser: "self",
          min: 0,
          max: 1,
          saveAs: selection,
        },
      },
      {
        connector: "ifYouDo",
        effect: {
          type: "playSelected",
          selection,
          ignoreCost: true,
        },
      },
    ]),
  );
});

test("contract rejects unknown selectedCards selection consumed by moveSelected", () => {
  assertUnsupported(
    block([
      {
        connector: "always",
        effect: {
          type: "moveSelected",
          selection: "missingSelection" as SelectionId,
          from: "hand",
          to: "deck",
          position: "bottom",
        },
      },
    ]),
  );
});
```

- [ ] **Step 2: Run the matrix test to verify RED**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: FAIL if any current support behavior is missing or still hidden in scattered state. If it passes immediately, keep the test and continue to Task 3 because it documents existing behavior.

- [ ] **Step 3: Commit the matrix tests if no production change is needed yet**

Run:

```powershell
git status --short --branch
git add packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
git commit -m "Add engine saved result contract matrix tests"
```

If Step 2 failed, do not commit yet. Continue to Task 3 and commit tests with the implementation.

---

### Task 3: Centralize Static Saved-Result Contract

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`

- [ ] **Step 1: Create the contract module**

Create `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`:

```ts
import type { Effect, SelectionId } from "@optcg/types";

import {
  savedSelectedCardsKindForSelectCardsSegment,
  savedSelectedCardsKindForSelectTargetsSegment,
  type SavedSelectedCardsKind,
} from "./selection.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

export interface SequenceSavedResultContractState {
  readonly selectedCards: ReadonlyMap<string, SavedSelectedCardsKind>;
  readonly selectedCardMaxCounts: ReadonlyMap<string, number>;
  readonly selectionSets: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly selectedTargets: ReadonlySet<string>;
}

export const emptySequenceSavedResultContractState = (
  initialSelectedTargets: readonly string[] = [],
): SequenceSavedResultContractState => ({
  selectedCards: new Map(),
  selectedCardMaxCounts: new Map(),
  selectionSets: new Set(),
  numbers: new Set(),
  selectedTargets: new Set(initialSelectedTargets),
});

const cloneWith = (
  state: SequenceSavedResultContractState,
  patch: Partial<{
    selectedCards: Map<string, SavedSelectedCardsKind>;
    selectedCardMaxCounts: Map<string, number>;
    selectionSets: Set<string>;
    numbers: Set<string>;
    selectedTargets: Set<string>;
  }>,
): SequenceSavedResultContractState => ({
  selectedCards: patch.selectedCards ?? new Map(state.selectedCards),
  selectedCardMaxCounts:
    patch.selectedCardMaxCounts ?? new Map(state.selectedCardMaxCounts),
  selectionSets: patch.selectionSets ?? new Set(state.selectionSets),
  numbers: patch.numbers ?? new Set(state.numbers),
  selectedTargets: patch.selectedTargets ?? new Set(state.selectedTargets),
});

export const selectedCardsKind = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): SavedSelectedCardsKind | undefined =>
  state.selectedCards.get(String(selection));

export const selectedCardsMaxCount = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): number | undefined => state.selectedCardMaxCounts.get(String(selection));

export const hasSelectionSet = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): boolean => state.selectionSets.has(String(selection));

export const hasSelectedCardSet = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): boolean =>
  hasSelectionSet(state, selection) ||
  state.selectedCards.has(String(selection));

export const hasNumber = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): boolean => state.numbers.has(String(selection));

export const hasSelectedTargets = (
  state: SequenceSavedResultContractState,
  selection: unknown,
): boolean => state.selectedTargets.has(String(selection));

export const recordSequenceProducer = (
  state: SequenceSavedResultContractState,
  segment: SequenceSegment,
): SequenceSavedResultContractState | null => {
  if (segment.effect.type === "chooseNumber") {
    const numbers = new Set(state.numbers);
    numbers.add(String(segment.effect.saveAs));
    return cloneWith(state, { numbers });
  }
  if (segment.effect.type === "revealTop") {
    const selectionSets = new Set(state.selectionSets);
    selectionSets.add(String(segment.effect.saveAs));
    return cloneWith(state, { selectionSets });
  }
  if (segment.effect.type === "selectFromSet") {
    const selectedCards = new Map(state.selectedCards);
    const selectedCardMaxCounts = new Map(state.selectedCardMaxCounts);
    selectedCards.set(String(segment.effect.saveAs), "set");
    selectedCardMaxCounts.set(
      String(segment.effect.saveAs),
      segment.effect.max,
    );
    return cloneWith(state, { selectedCards, selectedCardMaxCounts });
  }
  if (segment.effect.type === "selectCards") {
    const kind = savedSelectedCardsKindForSelectCardsSegment(segment.effect);
    if (kind === undefined) return null;
    const selectedCards = new Map(state.selectedCards);
    const selectedCardMaxCounts = new Map(state.selectedCardMaxCounts);
    selectedCards.set(String(segment.effect.saveAs), kind);
    selectedCardMaxCounts.set(
      String(segment.effect.saveAs),
      segment.effect.max,
    );
    return cloneWith(state, { selectedCards, selectedCardMaxCounts });
  }
  if (segment.effect.type === "selectTargets") {
    const selectedTargets = new Set(state.selectedTargets);
    const selectedCards = new Map(state.selectedCards);
    if (segment.saveResultAs !== undefined) {
      selectedTargets.add(segment.saveResultAs);
      const kind = savedSelectedCardsKindForSelectTargetsSegment(
        segment.effect,
      );
      if (kind !== undefined) {
        selectedCards.set(segment.saveResultAs, kind);
      }
    }
    return cloneWith(state, { selectedTargets, selectedCards });
  }
  if (segment.effect.type === "selectAllTargets") {
    if (segment.saveResultAs === undefined) return state;
    const selectedTargets = new Set(state.selectedTargets);
    selectedTargets.add(segment.saveResultAs);
    return cloneWith(state, { selectedTargets });
  }
  return state;
};

export const ownerConstraintReferenceExists = (
  state: SequenceSavedResultContractState,
  selection: SelectionId,
): boolean =>
  hasSelectedCardSet(state, selection) || hasSelectedTargets(state, selection);
```

- [ ] **Step 2: Move state fields in `support.ts` behind the contract**

In `packages/engine-core/src/effect-runtime-sequence/support.ts`, replace the separate maps and sets in `SequenceSupportState` with:

```ts
savedResults: SequenceSavedResultContractState;
```

Update initialization:

```ts
savedResults: emptySequenceSavedResultContractState(
  options.initialSavedSelectedTargets ?? [],
),
```

Update cloning:

```ts
savedResults: {
  selectedCards: new Map(state.savedResults.selectedCards),
  selectedCardMaxCounts: new Map(state.savedResults.selectedCardMaxCounts),
  selectionSets: new Set(state.savedResults.selectionSets),
  numbers: new Set(state.savedResults.numbers),
  selectedTargets: new Set(state.savedResults.selectedTargets),
},
```

Replace local helpers with imports from `save-result-contract.ts`:

```ts
import {
  emptySequenceSavedResultContractState,
  hasNumber,
  hasSelectedCardSet,
  hasSelectedTargets,
  hasSelectionSet,
  ownerConstraintReferenceExists,
  recordSequenceProducer,
  selectedCardsKind,
  selectedCardsMaxCount,
  type SequenceSavedResultContractState,
} from "./support/save-result-contract.js";
```

- [ ] **Step 3: Record producers through the contract**

In `support.ts`, replace direct mutation for producer segments:

```ts
const nextSavedResults = recordSequenceProducer(
  supportState.savedResults,
  segment,
);
if (nextSavedResults === null) {
  return false;
}
supportState.savedResults = nextSavedResults;
```

Apply this to producer branches:

- `chooseNumber`
- `revealTop`
- `selectFromSet`
- `selectCards`
- `selectTargets`
- `selectAllTargets`

Keep branch-specific validation such as `isSupportedSequenceTargetRequest`, `isSupportedSelectFromSetSegment`, and `hasSavedOwnerConstraintReference`, but read saved state through `supportState.savedResults`.

- [ ] **Step 4: Update consumer checks to use the contract**

Replace consumer reads in `support.ts`:

```ts
selectedCardsKind(supportState.savedResults, segment.effect.selection);
selectedCardsMaxCount(supportState.savedResults, segment.effect.selection);
hasSelectionSet(supportState.savedResults, segment.effect.set);
hasSelectedCardSet(supportState.savedResults, segment.effect.set);
hasNumber(supportState.savedResults, selection);
hasSelectedTargets(supportState.savedResults, segment.effect.selection);
ownerConstraintReferenceExists(
  supportState.savedResults,
  segment.effect.ownerConstraint.selection,
);
```

- [ ] **Step 5: Run the static matrix test**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit contract centralization**

Run:

```powershell
git status --short --branch
git add packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts packages/engine-core/src/effect-runtime-sequence/support.ts packages/engine-core/src/effect-runtime-sequence/support/selection.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
git commit -m "Centralize engine sequence saved result contract"
```

---

### Task 4: Prove Runtime Ledgers Match Static Contract

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts`

- [ ] **Step 1: Write runtime proof tests**

Create `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts` with tests that execute real decisions and inspect frame saved references:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  GameState,
  PlayerId,
  SelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const setupSequence = (state: GameState, effect: Effect): void => {
  const p1State = must(state.players[p1], "p1");
  state.turn.turnPlayerId = p1;
  const source = p1State.leader;
  const effectDefinitionId = "def-saved-result-contract";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "saved-result-contract-rules",
      sourceTextHash: "saved-result-contract-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-saved-result-contract"),
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
    ],
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry:saved-result-contract"),
      timingWindowId: toTimingWindowId("timing-window:saved-result-contract"),
      queueOrigin: { type: "activateMain" },
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "savedResultContractTest" },
    },
  ];
};

const moveDonToCostArea = (
  state: GameState,
  playerId: PlayerId,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON");
  player.donDeck = player.donDeck.slice(1);
  const costDon = {
    ...don,
    zone: {
      zone: "costArea",
      playerId,
      slot: "cost",
      index: player.costArea.length,
    },
    state: "rested",
  } satisfies CardInstance;
  player.costArea = [...player.costArea, costDon];
  state.cardManifest.cards[don.cardId] = resolvedCard({
    cardId: don.cardId,
    category: "don",
  });
  return costDon;
};

test("runtime saves costArea DON selectTargets and attachSelectedDon consumes it", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p1Target = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "p1 target"),
    zone: "characterArea",
  });
  const p1Don = moveDonToCostArea(state, p1);
  state.cardManifest.cards[p1Target.cardId] = resolvedCard({
    cardId: p1Target.cardId,
    category: "character",
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
  });
  const donSelection = "donSelection" as SelectionId;
  const targetSelection = "targetSelection";
  setupSequence(state, {
    type: "sequence",
    effects: [
      {
        connector: "always",
        saveResultAs: donSelection,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "costArea",
            filter: { categories: ["don"] },
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      {
        connector: "ifYouDo",
        saveResultAs: targetSelection,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "characterArea",
            filter: { categories: ["character"] },
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection: donSelection,
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: targetSelection,
            },
            zone: "characterArea",
            player: "self",
            filter: { categories: ["character"] },
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  });

  const selectDonRun = processEffectRuntime(state);
  assert.equal(selectDonRun.errors, undefined);
  const selectDon = must(selectDonRun.state.pendingDecision, "select DON");
  assert.equal(selectDon.type, "selectTargets");
  const selectedDon = applyAction(selectDonRun.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: {
      type: "targets",
      targets: [
        must(
          selectDon.candidates.find(
            (candidate) => candidate.card.instanceId === p1Don.instanceId,
          ),
          "DON candidate",
        ).card,
      ],
    },
  });
  assert.equal(selectedDon.errors, undefined);
  const selectTarget = must(selectedDon.state.pendingDecision, "select target");
  assert.equal(selectTarget.type, "selectTargets");
  const selectedTarget = applyAction(selectedDon.state, {
    type: "respondToDecision",
    decisionId: selectTarget.id,
    response: {
      type: "targets",
      targets: [
        must(
          selectTarget.candidates.find(
            (candidate) => candidate.card.instanceId === p1Target.instanceId,
          ),
          "target candidate",
        ).card,
      ],
    },
  });

  assert.equal(selectedTarget.errors, undefined);
  assert.deepEqual(
    must(selectedTarget.state.players[p1], "p1 after").characters.find(
      (card) => card.instanceId === p1Target.instanceId,
    )?.attachedDon,
    [p1Don.instanceId],
  );
});
```

- [ ] **Step 2: Run runtime test**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts
```

Expected: PASS, or FAIL with a real runtime ledger mismatch that must be fixed before moving on.

- [ ] **Step 3: Add at least one set-selection runtime proof**

Add another test to the same file proving:

- `revealTop` creates a set reference
- `selectFromSet` creates selected cards
- `revealSelected` or `playSelected` consumes those selected cards

Use existing helpers from `packages/engine-core/src/runtime/conditions/set-selection-sequence.test.ts` as reference for state setup and responses.

- [ ] **Step 4: Run runtime test again**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit runtime proof**

Run:

```powershell
git status --short --branch
git add packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts
git commit -m "Prove runtime saved result contract paths"
```

---

### Task 5: Add Explicit Segment Metadata After Engine Contract Is Proven

**Files:**

- Modify: `packages/types/src/effects.ts`
- Modify: `packages/types/src/effects.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`

- [ ] **Step 1: Add RED tests for explicit metadata**

In `packages/types/src/effects.test.ts`, add:

```ts
test("TYP sequence segment may declare explicit saved result kind", () => {
  const segment: SequencedEffect = {
    connector: "always",
    saveResultAs: "selectedDon",
    saveResultKind: "selectedCards:don",
    effect: {
      type: "selectTargets",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zone: "costArea",
        filter: { categories: ["don"] },
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
      },
    },
  };

  expect(segment.saveResultKind).toBe("selectedCards:don");
});
```

In `support-save-result-contract.test.ts`, add:

```ts
test("contract rejects explicit selectedCards DON metadata on a hand producer", () => {
  assertUnsupported(
    block([
      {
        connector: "always",
        saveResultAs: "badDon",
        saveResultKind: "selectedCards:don",
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "self",
          chooser: "self",
          min: 1,
          max: 1,
          saveAs: "badDon" as SelectionId,
          visibility: "chooserOnly",
        },
      },
    ]),
  );
});
```

- [ ] **Step 2: Run RED tests**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: FAIL because `saveResultKind` is not typed or validated yet.

- [ ] **Step 3: Add segment metadata type**

In `packages/types/src/effects.ts`, add:

```ts
export type SequenceSaveResultKind =
  | "selectedCards:hand"
  | "selectedCards:trash"
  | "selectedCards:don"
  | "selectedCards:set"
  | "selectedTargets"
  | "selectionSet"
  | "number"
  | "paidCost";
```

Update `SequencedEffect`:

```ts
saveResultKind?: SequenceSaveResultKind;
```

- [ ] **Step 4: Validate explicit metadata in the contract module**

In `save-result-contract.ts`, add:

```ts
const kindForSelectedCards = (
  kind: SavedSelectedCardsKind,
): `selectedCards:${SavedSelectedCardsKind}` => `selectedCards:${kind}`;

const explicitKindMatchesSelectedCards = (
  explicit: SequenceSegment["saveResultKind"] | undefined,
  inferred: SavedSelectedCardsKind,
): boolean =>
  explicit === undefined || explicit === kindForSelectedCards(inferred);
```

Use it in `recordSequenceProducer` for `selectCards`, `selectTargets` DON, and `selectFromSet`. If explicit metadata exists and does not match inferred producer kind, return `null`.

For pure target producers:

```ts
if (
  segment.saveResultKind !== undefined &&
  segment.saveResultKind !== "selectedTargets"
) {
  return null;
}
```

For `revealTop`, require `selectionSet` if explicit kind is present. For `chooseNumber`, require `number`. For paid cost, require `paidCost` in the relevant pay-cost support path.

- [ ] **Step 5: Run explicit metadata tests**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit explicit metadata support**

Run:

```powershell
git status --short --branch
git add packages/types/src/effects.ts packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
git commit -m "Add explicit sequence saved result metadata"
```

---

### Task 6: Parser Integration Against Proven Engine Contract

**Files:**

- Modify: `packages/cards/src/instructions/don-movement/attach-rested.ts`
- Modify: parser tests:
  - `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`

- [ ] **Step 1: Add parser RED assertions for explicit metadata**

In the parser tests, only add expected metadata to producer segments that save source DON selections:

```ts
saveResultKind: "selectedCards:don",
```

Do not add it to target-selection segments unless the segment truly produces selected field targets and the expected value is:

```ts
saveResultKind: "selectedTargets",
```

- [ ] **Step 2: Run parser tests RED**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts
```

Expected: FAIL because parser output does not include `saveResultKind`.

- [ ] **Step 3: Emit metadata from parser producer sites**

In `packages/cards/src/instructions/don-movement/attach-rested.ts`, add:

```ts
saveResultKind: "selectedCards:don",
```

to each DON source-selection segment that saves `donAttachSelection`.

Add:

```ts
saveResultKind: "selectedTargets",
```

only to target-selection producer segments when tests require it and support validation accepts it.

- [ ] **Step 4: Prove parser output is engine-supported**

In `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`, keep the parsed owner-relative DON shape and assert:

```ts
assert.equal(
  isSupportedSequenceBlock(
    must(state.effectQueue[0], "queued effect"),
    must(
      Object.values(
        must(state.cardManifest.effectDefinitions, "definitions"),
      )[0]?.effects[0],
      "effect block",
    ),
  ),
  true,
);
```

Expected: this remains true with explicit metadata because engine contract validation agrees with parser output.

- [ ] **Step 5: Run parser plus engine integration tests**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit parser integration**

Run:

```powershell
git status --short --branch
git add packages/cards/src/instructions/don-movement/attach-rested.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
git commit -m "Emit parser metadata for engine saved result contract"
```

---

### Task 7: Full Verification

**Files:**

- No source changes expected unless checks reveal issues.

- [ ] **Step 1: Run focused engine and parser tests**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts packages/types/src/effects.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect final status**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree, or only unrelated user/agent files that were intentionally not staged.

- [ ] **Step 4: Commit formatter-only owned changes if needed**

Only run this if `git status --short` shows owned modified files from this work:

```powershell
git add <owned-changed-files>
git commit -m "Format engine sequence contract proof"
```

Expected: commit succeeds and pre-commit hook passes.

---

## Self-Review

- The plan no longer proves only one DON attachment path. It starts with an engine-core saved-result producer/consumer matrix and adds runtime ledger proof before parser integration.
- Parser output is not treated as authority. Parser metadata is only accepted after the engine contract validates the semantics.
- The plan explicitly tests mismatch rejection: hand cards cannot satisfy DON consumers, missing selections fail closed, and explicit metadata cannot contradict inferred producer kind.
- The plan preserves compatibility by keeping inference when explicit metadata is absent, then adding metadata after the engine contract is centralized.
- Shared-workspace commit rules are included before every commit.
