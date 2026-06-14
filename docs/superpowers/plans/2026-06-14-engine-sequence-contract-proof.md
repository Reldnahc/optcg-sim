# Engine Sequence Contract Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the engine sequence saved-result boundary for every current saved-reference producer and consumer category, then make parser output validate against that engine contract.

**Architecture:** First add an inventory guard that recursively scans the runtime source for saved-reference writes and reads. Then centralize static support in `engine-core` with capability sets per saved id, add a full producer/consumer matrix, and add runtime ledger tests that inspect saved references while frames are paused. Parser metadata comes last and is accepted only after the engine contract proves the semantics.

**Tech Stack:** TypeScript, Vitest, `@optcg/types`, `@optcg/engine-core`, `@optcg/cards`, `npm.cmd`/pnpm scripts.

---

## Definition Of Everything

This plan covers every current `SequenceSavedResultReference` kind in `packages/types/src/effects.ts`:

- `selectedCards`
- `selectedTargets`
- `paidCost`
- `producedObjects`
- `chosenNumber`

It also covers the engine-only static support subkinds that decide which consumers may use a `selectedCards` reference:

- selected hand cards
- selected trash cards
- selected DON cards
- selected set cards

It covers every current producer door:

- `selectCards`
- `selectTargets`
- `selectAllTargets`
- `selectFromSet`
- `revealTop`
- `chooseNumber`
- `payCost`
- `draw`
- `drawUpTo`
- `playSelected`
- trigger-context produced object seed, currently `trigger:cardPlayed`
- `forEachSavedTarget` current-item references

It covers every current consumer door:

- `moveSelected`
- `attachSelectedDon`
- `playSelected`
- `activateSelectedEvent`
- `revealSelected`
- selected-card movement helpers: selected to hand, selected to life, selected trash to life, selected hand to life
- `selectFromSet`
- `placeSetRemainder`
- `savedNumber` stat comparisons
- `ownerConstraint`
- `savedFieldObject` targets through field support
- `savedFieldObject` targets through continuous support
- saved-field-object swap/base-power doors
- `forEachSavedTarget`
- produced-object `savedFieldObject` targets
- paid-cost `savedFieldObject` targets

If any listed category cannot be handled in the first implementation slice, the executor must stop and revise the plan instead of silently narrowing the claim.

---

## File Structure

- Create `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
  - Central static support contract.
  - Owns producer classification, consumer validation, and the support-time state map.
  - Stores capability sets per saved id, not one kind per saved id.
  - No parser imports.

- Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts`
  - Recursive source-inventory guard for saved-reference writes and reads.
  - Scans `packages/engine-core/src/effect-runtime-sequence` and `packages/engine-core/src/runtime/primitives`.
  - Fails when a new saved-reference producer or consumer appears without updating the explicit expected list.

- Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`
  - Static producer/consumer matrix for every category listed above.
  - Includes a dual-capability id regression for cost-area DON selected via `selectTargets`.

- Create `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts`
  - Runtime ledger proof.
  - Asserts `effectExecutionFrames[*].savedReferences` while frames are paused, including non-pausing producers kept alive by a concrete next decision.

- Modify `packages/engine-core/src/effect-runtime-sequence/support.ts`
  - Replace scattered support-time saved-result maps/sets with the contract state.
  - Keep sequence orchestration here.

- Modify `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
  - Keep local selection shape helpers only.
  - Remove cross-segment saved-result authority from this file after contract centralization.

- Modify runtime support helpers as needed:
  - `packages/engine-core/src/effect-runtime-sequence/support/field.ts`
  - `packages/engine-core/src/effect-runtime-sequence/support/continuous.ts`
  - `packages/engine-core/src/effect-runtime-sequence/support/basic.ts`
  - Only if consumer validation currently lives there and needs to call the central contract.

- Reference existing runtime consumer files:
  - `packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts`
  - `packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts`
  - `packages/engine-core/src/runtime/primitives/play-selected.ts`

- Modify `packages/types/src/effects.ts`
  - Add optional explicit segment metadata after engine proof exists.

- Modify `packages/types/src/effects.test.ts`
  - Type tests for explicit metadata.

- Modify parser integration files after engine proof exists:
  - `packages/cards/src/instructions/don-movement/attach-rested.ts`
  - `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`

---

## Shared Workspace Rule

Before every commit:

```powershell
git status --short --branch
```

If any task-owned file contains unrelated edits, use `git add -p` and stage only the hunks from the task. Do not use plain `git add <file>` on a file with mixed ownership.

Each commit step below says `git add -p` intentionally.

---

### Task 1: Commit The Plan Replacement

**Files:**

- Modify: `docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md`

- [ ] **Step 1: Confirm the narrow plan is gone**

Run:

```powershell
Test-Path docs/superpowers/plans/2026-06-14-explicit-sequence-save-result-kind.md
```

Expected: `False`.

- [ ] **Step 2: Confirm this full proof plan exists**

Run:

```powershell
Test-Path docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md
```

Expected: `True`.

- [ ] **Step 3: Commit only the plan replacement**

Run:

```powershell
git status --short --branch
git add -p docs/superpowers/plans/2026-06-14-engine-sequence-contract-proof.md
git commit -m "Cover full engine sequence contract in plan"
```

Expected: commit succeeds and only this plan file is included.

---

### Task 2: Add Recursive Saved-Reference Inventory Guard

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts`

- [ ] **Step 1: Write the inventory test**

Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts`:

```ts
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const scanRoots = [
  "packages/engine-core/src/effect-runtime-sequence",
  "packages/engine-core/src/runtime/primitives",
];

const knownSavedReferenceWriters = [
  "packages/engine-core/src/effect-runtime-sequence/segments.ts",
  "packages/engine-core/src/effect-runtime-sequence/select-cards.ts",
  "packages/engine-core/src/effect-runtime-sequence/select-targets.ts",
  "packages/engine-core/src/effect-runtime-sequence/frames/optional.ts",
  "packages/engine-core/src/effect-runtime-sequence/frames/start.ts",
  "packages/engine-core/src/effect-runtime-sequence/runner/select-all-targets-segment.ts",
  "packages/engine-core/src/effect-runtime-sequence/runner/for-each-saved-target.ts",
  "packages/engine-core/src/effect-runtime-sequence/draw-upto.ts",
  "packages/engine-core/src/runtime/primitives/play-selected.ts",
].sort();

const knownSavedReferenceReaders = [
  "packages/engine-core/src/effect-runtime-sequence/select-targets.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-segments.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-reveal.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-to-hand.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-hand-to-life.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-trash-to-life.ts",
  "packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts",
  "packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts",
  "packages/engine-core/src/effect-runtime-sequence/runner/for-each-saved-target.ts",
].sort();

const findSourceFiles = async (path: string): Promise<string[]> => {
  const entries = await readdir(`${repoRoot}/${path}`, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await findSourceFiles(child)));
      continue;
    }

    if (
      [".ts", ".tsx"].includes(extname(entry.name)) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      found.push(child);
    }
  }

  return found;
};

const sourcePath = (path: string) =>
  relative(repoRoot, `${repoRoot}/${path}`).replaceAll("\\", "/");

test("saved-result contract inventory names every current saved-reference kind", async () => {
  const effectsSource = await readFile(
    new URL("../../../types/src/effects.ts", import.meta.url),
    "utf8",
  );

  for (const kind of [
    "selectedCards",
    "selectedTargets",
    "paidCost",
    "producedObjects",
    "chosenNumber",
  ]) {
    assert.equal(effectsSource.includes(`kind: "${kind}"`), true, kind);
  }
});

test("saved-result contract inventory has explicit writer coverage", async () => {
  const observed = new Set<string>();
  const files = (await Promise.all(scanRoots.map(findSourceFiles))).flat();

  for (const path of files) {
    const source = await readFile(`${repoRoot}/${path}`, "utf8");
    if (
      source.includes("saveReference(") ||
      source.includes("savedReferences:") ||
      source.includes('kind: "selectedCards"') ||
      source.includes('kind: "selectedTargets"') ||
      source.includes('kind: "paidCost"') ||
      source.includes('kind: "producedObjects"') ||
      source.includes('kind: "chosenNumber"')
    ) {
      observed.add(sourcePath(path));
    }
  }

  assert.deepEqual([...observed].sort(), knownSavedReferenceWriters);
});

test("saved-result contract inventory has explicit reader coverage", async () => {
  const observed = new Set<string>();
  const files = (await Promise.all(scanRoots.map(findSourceFiles))).flat();

  for (const path of files) {
    const source = await readFile(`${repoRoot}/${path}`, "utf8");
    if (
      source.includes("ledgers.savedReferences[") ||
      source.includes("frame.savedReferences[") ||
      source.includes(".savedReferences[") ||
      source.includes("savedReferences[")
    ) {
      observed.add(sourcePath(path));
    }
  }

  assert.deepEqual([...observed].sort(), knownSavedReferenceReaders);
});
```

- [ ] **Step 2: Run the inventory test**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts
```

Expected: It may fail because the explicit lists must be aligned to the current source. If it fails, inspect each observed file and either add it to the correct list or explain why it is not a saved-result door in a test comment. Do not restrict the scan to make the test pass.

- [ ] **Step 3: Commit the inventory guard**

Run:

```powershell
git status --short --branch
git add -p packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts
git commit -m "Inventory engine saved result doors"
```

Expected: commit succeeds.

---

### Task 3: Add Complete Static Matrix Tests

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`

- [ ] **Step 1: Write the matrix harness**

Create `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts` with a synthetic entry, a `block(effects)` helper, and `assertSupported` / `assertUnsupported` helpers. Use the shape already established in existing support tests:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

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
  effects: SequenceSegment[],
): EffectDefinition["effects"][number] => ({
  id: "save-result-contract-effect" as EffectDefinition["effects"][number]["id"],
  category: "auto",
  trigger: { type: "onPlay" },
  optional: false,
  oncePerTurn: false,
  sourcePresencePolicy: "mustRemainInSameZone",
  effect: { type: "sequence", effects },
});

const assertSupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    true,
  );
};

const assertUnsupported = (effects: SequenceSegment[]) => {
  assert.equal(
    isSupportedSequenceBlock(syntheticEntry(), block(effects)),
    false,
  );
};
```

- [ ] **Step 2: Add selectedCards matrix tests**

Add tests for:

- hand `selectCards` -> `moveSelected` from hand
- trash `selectCards` -> `moveSelected` from trash
- costArea DON `selectCards` -> `attachSelectedDon`
- costArea DON `selectTargets` -> `attachSelectedDon`
- costArea DON `selectTargets` -> savedFieldObject target using the same save id
- revealTop selectedCards/set -> `selectFromSet` -> `playSelected`
- hand selectedCards -> `attachSelectedDon` is rejected
- DON selectedCards -> hand `moveSelected` is rejected
- missing selectedCards reference -> rejected

The cost-area DON `selectTargets` test is required because that saved id has two static capabilities: `selectedTargets` and `selectedCards:don`.

- [ ] **Step 3: Add selectedTargets and savedFieldObject matrix tests**

Add tests for:

- `selectTargets` -> `savedFieldObject` consumer through a representative field mutation from `support/field.ts`
- `selectTargets` -> `savedFieldObject` consumer through a representative continuous modifier from `support/continuous.ts`
- `selectTargets` -> `savedFieldObject` consumer through the swap/base-power support path
- `selectAllTargets` -> `forEachSavedTarget`
- `forEachSavedTarget` current item -> `savedFieldObject` consumer
- ownerConstraint using selectedCards owner reference
- ownerConstraint using selectedTargets owner reference
- missing `savedFieldObject.binding.saveResultAs` target reference -> rejected
- wrong family for `savedFieldObject` target -> rejected

The representative saved-field-object cases must exercise current support doors that runtime resolves in `saved-field-object/segment-appliers.ts`, not only a synthetic helper.

- [ ] **Step 4: Add paidCost and producedObjects matrix tests**

Add tests for:

- `payCost` with `saveResultAs: "paidCost"` -> `savedFieldObject` target with `family: "paidCost"` where the cost selected a field card or DON card
- `draw` with `saveResultAs` -> `savedFieldObject` target with `family: "producedObjects"`
- `drawUpTo` with `saveResultAs` -> `savedFieldObject` target with `family: "producedObjects"`
- `playSelected` with `saveResultAs` -> `savedFieldObject` target with `family: "producedObjects"`
- initial trigger-context `trigger:cardPlayed` produced object -> consumer support through `initialSavedSelectedTargets` or the contract equivalent
- missing producedObjects reference -> rejected
- missing paidCost reference -> rejected

- [ ] **Step 5: Add chosenNumber and remainder matrix tests**

Add tests for:

- `chooseNumber` -> `selectFromSet` stat comparison using `savedNumber`
- `revealTop` -> `placeSetRemainder`
- missing number -> rejected
- missing selection set -> rejected

- [ ] **Step 6: Add composition matrix tests**

Add tests for:

- nested sequence preserves produced selectedCards reference for later sibling consumer
- flattened sequence preserves selectedTargets reference
- conditional branch does not leak branch-local references into outer siblings unless the current engine intentionally supports it; assert current intended behavior explicitly
- choice branch support validates each branch independently and does not merge references from one choice option into another

- [ ] **Step 7: Run matrix tests RED**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: FAIL for at least the currently missing target-binding validation and any other missing categories.

Do not weaken tests to fit current behavior. If a category currently cannot be represented safely, keep the failing test and implement the missing contract support in Task 4.

---

### Task 4: Centralize The Complete Static Contract

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support.ts`
- Modify as needed:
  - `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
  - `packages/engine-core/src/effect-runtime-sequence/support/field.ts`
  - `packages/engine-core/src/effect-runtime-sequence/support/continuous.ts`

- [ ] **Step 1: Create the capability-set contract model**

Create `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts` with these concepts:

```ts
import type { Effect, SavedFieldObjectReferenceFamily } from "@optcg/types";

import type { SavedSelectedCardsKind } from "./selection.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

export type SelectedCardsCapability = {
  readonly kind: "selectedCards";
  readonly cardKind: SavedSelectedCardsKind;
  readonly max?: number;
};

export type SavedReferenceCapability =
  | SelectedCardsCapability
  | { readonly kind: "selectedTargets" }
  | { readonly kind: "paidCost" }
  | { readonly kind: "producedObjects" }
  | { readonly kind: "chosenNumber" };

export interface StaticSavedReferenceCapabilities {
  readonly capabilities: readonly SavedReferenceCapability[];
}

export interface StaticSavedResultState {
  readonly references: ReadonlyMap<string, StaticSavedReferenceCapabilities>;
  readonly transientSets: ReadonlySet<string>;
}

export const emptyStaticSavedResultState = (
  initial: Record<string, readonly SavedReferenceCapability[]> = {},
): StaticSavedResultState => ({
  references: new Map(
    Object.entries(initial).map(([id, capabilities]) => [id, { capabilities }]),
  ),
  transientSets: new Set(),
});

const sameCapability = (
  a: SavedReferenceCapability,
  b: SavedReferenceCapability,
): boolean =>
  a.kind === b.kind &&
  (a.kind !== "selectedCards" ||
    (b.kind === "selectedCards" && a.cardKind === b.cardKind));

export const addCapability = (
  state: StaticSavedResultState,
  id: string,
  capability: SavedReferenceCapability,
): StaticSavedResultState => {
  const existing = state.references.get(id)?.capabilities ?? [];
  const capabilities = existing.some((item) => sameCapability(item, capability))
    ? existing
    : [...existing, capability];

  return {
    references: new Map(state.references).set(id, { capabilities }),
    transientSets: new Set(state.transientSets),
  };
};

export const hasReferenceCapability = (
  state: StaticSavedResultState,
  id: unknown,
  predicate: (capability: SavedReferenceCapability) => boolean,
): boolean =>
  state.references.get(String(id))?.capabilities.some(predicate) ?? false;
```

- [ ] **Step 2: Implement producer recording for every kind**

Add `recordProducer(state, segment)` that records:

- `selectCards` -> `selectedCards` with subkind `hand`, `trash`, or `don`
- `selectTargets` costArea DON -> both `{ kind: "selectedTargets" }` and `{ kind: "selectedCards", cardKind: "don" }`
- other `selectTargets` -> `selectedTargets`
- `selectAllTargets` -> `selectedTargets`
- `selectFromSet` -> `selectedCards:set`
- `revealTop` -> `selectedCards:set` and transient set
- `chooseNumber` -> `chosenNumber`
- `payCost` with `saveResultAs` -> `paidCost`
- `draw` or `drawUpTo` with `saveResultAs` -> `producedObjects`
- `playSelected` with `saveResultAs` -> `producedObjects`
- `forEachSavedTarget` current item -> `selectedTargets` while validating its source selection exists
- initial trigger-context produced object via explicit initial contract state

If the segment has `saveResultAs` and the producer type is not one of the supported producer kinds, return `null`.

- [ ] **Step 3: Implement consumer validation for every door**

Add validation helpers:

```ts
export const canConsumeSelectedCards = (
  state: StaticSavedResultState,
  selection: unknown,
  allowed: readonly SavedSelectedCardsKind[],
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) =>
      capability.kind === "selectedCards" &&
      allowed.includes(capability.cardKind),
  );

export const canConsumeSavedFieldObject = (
  state: StaticSavedResultState,
  family: SavedFieldObjectReferenceFamily,
  saveResultAs: string,
): boolean => {
  const expected: Record<
    SavedFieldObjectReferenceFamily,
    SavedReferenceCapability["kind"]
  > = {
    selectedTargets: "selectedTargets",
    forEachSavedTarget: "selectedTargets",
    producedObjects: "producedObjects",
    paidCost: "paidCost",
  };

  return hasReferenceCapability(
    state,
    saveResultAs,
    (capability) => capability.kind === expected[family],
  );
};

export const canConsumeNumber = (
  state: StaticSavedResultState,
  selection: unknown,
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) => capability.kind === "chosenNumber",
  );

export const canConsumeTransientSet = (
  state: StaticSavedResultState,
  set: unknown,
): boolean => state.transientSets.has(String(set));

export const canConstrainByOwner = (
  state: StaticSavedResultState,
  selection: unknown,
): boolean =>
  hasReferenceCapability(
    state,
    selection,
    (capability) =>
      capability.kind === "selectedCards" ||
      capability.kind === "selectedTargets",
  );
```

- [ ] **Step 4: Wire `support.ts` through the contract**

Replace support-time state fields with:

```ts
savedResults: StaticSavedResultState;
```

Every producer branch must call `recordProducer`.

Every consumer branch must call one of:

- `canConsumeSelectedCards`
- `canConsumeSavedFieldObject`
- `canConsumeNumber`
- `canConsumeTransientSet`
- `canConstrainByOwner`

Do not leave direct `Map`/`Set` saved-result mutation in `support.ts` except inside the contract state.

- [ ] **Step 5: Run matrix tests GREEN**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit static contract**

Run:

```powershell
git status --short --branch
git add -p packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts packages/engine-core/src/effect-runtime-sequence/support.ts packages/engine-core/src/effect-runtime-sequence/support/selection.ts packages/engine-core/src/effect-runtime-sequence/support/field.ts packages/engine-core/src/effect-runtime-sequence/support/continuous.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
git commit -m "Centralize full engine saved result contract"
```

Expected: commit succeeds. If `field.ts` or `continuous.ts` were not touched, omit them from staging.

---

### Task 5: Add Runtime Ledger Proof For Every Reference Kind

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts`

- [ ] **Step 1: Add runtime test harness**

Create `packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts` using existing helpers from `effect-runtime-queue/test-support.ts`. Include:

- `setupSequence(state, effect)` that installs an activate-main sequence on `p1` leader
- `moveDonToCostArea(state, playerId)`
- `pendingFrame(state)` helper:

```ts
const pendingFrame = (state: GameState) =>
  must(state.effectExecutionFrames[0], "pending effect execution frame");
```

- `savedReference(state, id)` helper:

```ts
const savedReference = (state: GameState, id: string) =>
  must(pendingFrame(state).savedReferences[id], `saved reference ${id}`);
```

- `pauseKeeper(saveResultAs)` helper that appends a concrete next decision so non-pausing producers leave the frame inspectable:

```ts
const pauseKeeper = (saveResultAs = "pauseTarget"): SequenceSegment => ({
  connector: "then",
  effect: {
    type: "selectTargets",
    prompt: "Choose your Leader.",
    min: 1,
    max: 1,
    saveResultAs,
    target: {
      type: "card",
      player: "you",
      zones: ["leaderArea"],
      categories: ["leader"],
    },
  },
});
```

Use `pauseKeeper()` after `draw`, `drawUpTo`, `playSelected`, trigger seed, and `chooseNumber` tests. Do not assert only final state for these producers.

- [ ] **Step 2: Add selectedCards runtime ledger tests**

Add tests that pause after each producer and assert `savedReference(...).kind`:

- `selectCards` hand saves `selectedCards`
- `selectCards` trash saves `selectedCards`
- costArea DON via `selectTargets` saves `selectedTargets` at runtime and final DON attachment proves the static selectedCards:don capability
- `selectFromSet` saves `selectedCards`
- `revealTop` saves `selectedCards`

These tests must inspect `effectExecutionFrames[0].savedReferences` after the response that creates the reference, while the next decision is pending.

- [ ] **Step 3: Add selectedTargets runtime ledger tests**

Add tests for:

- `selectTargets` saves `selectedTargets`
- `selectAllTargets` saves `selectedTargets`
- `forEachSavedTarget` current item saves `selectedTargets` for the loop body
- `ownerConstraint` uses selectedCards owner
- `ownerConstraint` uses selectedTargets owner

- [ ] **Step 4: Add paidCost, producedObjects, and chosenNumber runtime ledger tests**

Add tests for:

- accepted `payCost` saves `paidCost`
- declined optional cost does not save `paidCost`
- `draw` with `saveResultAs` saves `producedObjects`, with `pauseKeeper()` as the next segment
- `drawUpTo` with `saveResultAs` saves `producedObjects`, with `pauseKeeper()` as the next segment
- `playSelected` with `saveResultAs` saves `producedObjects`, with `pauseKeeper()` as the next segment
- trigger-context `cardPlayed` creates `producedObjects` seed, with `pauseKeeper()` as the next segment
- `chooseNumber` saves `chosenNumber`, with `pauseKeeper()` as the next segment

- [ ] **Step 5: Add savedFieldObject negative runtime tests**

Add tests for:

- missing `selectedTargets` savedFieldObject binding fails before mutation
- missing `producedObjects` savedFieldObject binding fails before mutation
- missing `paidCost` savedFieldObject binding fails before mutation

- [ ] **Step 6: Run runtime ledger proof**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit runtime proof**

Run:

```powershell
git status --short --branch
git add -p packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts
git commit -m "Prove runtime saved result ledgers"
```

---

### Task 6: Add Explicit Segment Metadata After Engine Proof

**Files:**

- Modify: `packages/types/src/effects.ts`
- Modify: `packages/types/src/effects.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts`

- [ ] **Step 1: Add RED type and support tests**

Add `SequenceSaveResultKind` expectations for every reference kind:

```ts
export type SequenceSaveResultKind =
  | "selectedCards:hand"
  | "selectedCards:trash"
  | "selectedCards:don"
  | "selectedCards:set"
  | "selectedTargets"
  | "paidCost"
  | "producedObjects"
  | "chosenNumber";
```

Add plural metadata to `SequencedEffect` because one producer can create multiple static capabilities:

```ts
saveResultKinds?: readonly SequenceSaveResultKind[];
```

Add support tests proving explicit metadata:

- matches each valid producer
- accepts cost-area DON `selectTargets` with `["selectedTargets", "selectedCards:don"]`
- rejects cost-area DON `selectTargets` if either required kind is missing
- rejects `selectedCards:don` on hand producer
- rejects `selectedTargets` on selectedCards producer
- rejects `paidCost` on draw producer
- rejects `producedObjects` on payCost producer
- rejects `chosenNumber` on non-number producer

- [ ] **Step 2: Run RED tests**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: FAIL because metadata is not typed/validated yet.

- [ ] **Step 3: Add type and validation**

Add `SequenceSaveResultKind` to `packages/types/src/effects.ts` and `saveResultKinds?: readonly SequenceSaveResultKind[]` to `SequencedEffect`.

In `save-result-contract.ts`, make `recordProducer` compare explicit metadata against inferred metadata for every producer. Compare as sets so order does not matter. If explicit metadata exists and differs, return `null`.

- [ ] **Step 4: Run GREEN tests**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit explicit metadata**

Run:

```powershell
git status --short --branch
git add -p packages/types/src/effects.ts packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/support/save-result-contract.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts
git commit -m "Add explicit saved result metadata contract"
```

---

### Task 7: Parser Integration Against The Engine Contract

**Files:**

- Modify: `packages/cards/src/instructions/don-movement/attach-rested.ts`
- Modify:
  - `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
  - `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`

- [ ] **Step 1: Add parser RED expectations**

For parser output that produces source DON through `selectCards`, expect:

```ts
saveResultKinds: ["selectedCards:don"],
```

For parser output that produces source DON through cost-area `selectTargets`, expect:

```ts
saveResultKinds: ["selectedTargets", "selectedCards:don"],
```

For parser output that selects field targets, expect:

```ts
saveResultKinds: ["selectedTargets"],
```

- [ ] **Step 2: Run parser tests RED**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts
```

Expected: FAIL because parser output has not emitted metadata.

- [ ] **Step 3: Emit parser metadata**

In `packages/cards/src/instructions/don-movement/attach-rested.ts`, emit:

```ts
saveResultKinds: ["selectedCards:don"],
```

on every `donAttachSelection` source producer that uses `selectCards`.

Emit:

```ts
saveResultKinds: ["selectedTargets", "selectedCards:don"],
```

on every source-DON producer that uses cost-area `selectTargets`.

Emit:

```ts
saveResultKinds: ["selectedTargets"],
```

on target-selection producer segments only when they save field targets.

- [ ] **Step 4: Prove parser output is engine-supported**

In `select-targets-owner-constraint.test.ts`, keep the parsed owner-relative DON regression and assert `isSupportedSequenceBlock(...) === true` with the explicit metadata included.

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
git add -p packages/cards/src/instructions/don-movement/attach-rested.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
git commit -m "Emit parser metadata for saved result contract"
```

---

### Task 8: Full Verification

**Files:**

- No source changes expected unless checks reveal issues.

- [ ] **Step 1: Run focused contract suite**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/support-save-result-contract-inventory.test.ts packages/engine-core/src/effect-runtime-sequence/support-save-result-contract.test.ts packages/engine-core/src/effect-runtime-sequence/saved-result-contract-runtime.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts packages/types/src/effects.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts
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

Expected: clean working tree, or only unrelated user/agent files intentionally left unstaged.

---

## Self-Review

- The plan covers every current `SequenceSavedResultReference` kind: `selectedCards`, `selectedTargets`, `paidCost`, `producedObjects`, and `chosenNumber`.
- The plan covers static selected-card subkinds: hand, trash, DON, and set.
- The plan covers every named producer, including `playSelected`.
- The plan covers representative field, continuous, and swap/base-power savedFieldObject consumer paths.
- The static model uses capability sets per saved id, so a cost-area DON `selectTargets` save can be both `selectedTargets` and `selectedCards:don`.
- Runtime tests must inspect paused frame ledgers, not just final gameplay results; non-pausing producers use `pauseKeeper()`.
- Source-inventory tests recursively scan relevant source roots and force future saved-result producers/readers to update the contract.
- Shared-workspace staging uses `git add -p` instead of plain file staging.
