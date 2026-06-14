# Explicit Sequence Save Result Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make parser-emitted sequence saved-result contracts explicit so runtime support does not have to guess that a cost-area DON selection should be treated as saved DON cards.

**Architecture:** Add optional `saveResultKind` metadata to `SequencedEffect`, beside existing `saveResultAs`. Runtime support will validate this metadata on the full sequence segment, not the inner effect, while preserving request-shape inference only when metadata is absent. The DON attachment parser will emit `saveResultKind: "don"` for every DON source-selection producer it owns.

**Tech Stack:** TypeScript, Vitest, `@optcg/types`, `@optcg/cards`, `@optcg/engine-core`, `npm.cmd`/pnpm scripts.

---

## File Structure

- Modify `packages/types/src/effects.ts`
  - Shared DSL/engine type contract.
  - Add `SequenceSaveResultKind` and `saveResultKind?: SequenceSaveResultKind` on `SequencedEffect`.

- Modify `packages/types/src/effects.test.ts`
  - Type-level coverage for valid and invalid `saveResultKind` values.

- Modify `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
  - Owns selection segment saved-kind validation.
  - Add helpers that accept the full `SequencedEffect` segment so segment metadata is visible.
  - Validate both `selectTargets` and `selectCards` because the parser will emit explicit DON kind for both.

- Modify `packages/engine-core/src/effect-runtime-sequence/support.ts`
  - Pass the full sequence segment into selection support helpers.
  - Fail closed when explicit metadata contradicts the selection request/effect shape.

- Modify `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`
  - Runtime support regression for explicit `saveResultKind: "don"`.
  - Negative coverage for invalid explicit DON metadata and for `saveResultKind: "targets"` suppressing DON inference.

- Modify `packages/cards/src/instructions/don-movement/attach-rested.ts`
  - Emit `saveResultKind: "don"` on all four DON source-selection producer sites:
    - main generic `sourceSelection` segment
    - distributed target `selectCards` segment
    - all-target distributed `selectCards` segment
    - simple rested-DON-to-target `selectCards` segment

- Modify parser tests:
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

### Task 1: Add Shared Type Contract

**Files:**

- Modify: `packages/types/src/effects.ts`
- Test: `packages/types/src/effects.test.ts`

- [ ] **Step 1: Write the failing type test**

Add this test near the existing sequence/saved-reference type tests in `packages/types/src/effects.test.ts`:

```ts
test("TYP sequence segments can declare explicit saved result kinds", () => {
  const donSegment: SequencedEffect = {
    connector: "always",
    saveResultAs: "donSelection:attach",
    saveResultKind: "don",
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
  };

  expect(donSegment.saveResultKind).toBe("don");

  const targetSegment: SequencedEffect = {
    connector: "ifYouDo",
    saveResultAs: "targetSelection:attach-don",
    saveResultKind: "targets",
    effect: {
      type: "selectTargets",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zones: ["leaderArea", "characterArea"],
        filter: { categories: ["leader", "character"] },
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
        visibility: "public",
      },
    },
  };

  expect(targetSegment.saveResultKind).toBe("targets");
});
```

Add this invalid-kind assertion near other `@ts-expect-error` checks:

```ts
test("TYP sequence saved result kind rejects unsupported labels", () => {
  const segment: SequencedEffect = {
    connector: "always",
    saveResultAs: "bad",
    // @ts-expect-error unsupported saved result kind should not compile.
    saveResultKind: "fieldObject",
    effect: { type: "draw", count: 1 },
  };

  expect(segment.saveResultAs).toBe("bad");
});
```

- [ ] **Step 2: Run the type package test to verify it fails**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts
```

Expected: FAIL because `saveResultKind` does not exist on `SequencedEffect`.

- [ ] **Step 3: Add the shared type**

In `packages/types/src/effects.ts`, add this before `export interface SequencedEffect`:

```ts
export type SequenceSaveResultKind =
  | "don"
  | "hand"
  | "trash"
  | "set"
  | "targets";
```

Update `SequencedEffect`:

```ts
export interface SequencedEffect {
  id?: string;
  effect: Effect | PayCostEffect;
  connector:
    | "always"
    | "then"
    | "ifPreviousSucceeded"
    | "ifPreviousNotSucceeded"
    | "ifYouDo"
    | "ifPossible";
  saveResultAs?: string;
  saveResultKind?: SequenceSaveResultKind;
  optional?: boolean;
  presentation?: EffectTextPresentationRef;
}
```

- [ ] **Step 4: Verify type tests pass**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit only this task**

Run:

```powershell
git status --short --branch
git add packages/types/src/effects.ts packages/types/src/effects.test.ts
git commit -m "Add explicit sequence save result kind type"
```

---

### Task 2: Validate Explicit Selection Kind In Runtime Support

**Files:**

- Modify: `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/support.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`

- [ ] **Step 1: Write failing positive and negative support tests**

In `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`, update `parsedCostedOwnerRelativeDonSequence()` so the DON source segment includes `saveResultKind: "don"`:

```ts
{
  id: "select:don-to-attach",
  connector: "always",
  saveResultAs: "donSelection:attach",
  saveResultKind: "don",
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
}
```

Add this negative test after the parsed costed sequence test:

```ts
test("sequence support rejects explicit DON save kind when request does not select DON", () => {
  const state = createActiveState();
  const invalid = parsedCostedOwnerRelativeDonSequence();
  const body = must(invalid.effects[1], "body segment");
  assert.equal(body.effect.type, "sequence");
  const selectDon = must(body.effect.effects[0], "select source segment");
  selectDon.effect = {
    type: "selectTargets",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "anyPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
  };
  setupDefinition(state, invalid);

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
    false,
  );
});
```

Add this second negative test to prove explicit `targets` suppresses cost-area DON inference:

```ts
test("sequence support does not infer DON selected cards when explicit kind is targets", () => {
  const state = createActiveState();
  const invalid = parsedCostedOwnerRelativeDonSequence();
  const body = must(invalid.effects[1], "body segment");
  assert.equal(body.effect.type, "sequence");
  const selectDon = must(body.effect.effects[0], "select source segment");
  selectDon.saveResultKind = "targets";
  setupDefinition(state, invalid);

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
    false,
  );
});
```

- [ ] **Step 2: Run the engine test to verify the new negatives fail**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: FAIL because runtime either ignores `saveResultKind` or falls back to DON inference when explicit `targets` is present.

- [ ] **Step 3: Add full-segment validation helpers**

In `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`, add a segment alias below `SequenceEffect`:

```ts
type SequenceSegment = SequenceEffect["effects"][number];
```

Replace `savedSelectedCardsKindForSelectCardsSegment` with a segment-aware version:

```ts
type SavedSelectedCardsKindResolution =
  | { valid: true; kind?: SavedSelectedCardsKind }
  | { valid: false };

const requestSelectsCostAreaDon = (
  request: SelectTargetsEffect["request"],
): boolean => {
  const zones = "zones" in request ? request.zones : [request.zone];
  return (
    request.chooser === "self" &&
    (request.player === "self" ||
      request.player === "opponent" ||
      request.player === "anyPlayer") &&
    zones.length > 0 &&
    zones.every((zone) => zone === "costArea") &&
    request.visibility === "public" &&
    request.filter?.categories?.length === 1 &&
    request.filter.categories[0] === "don"
  );
};

const inferredSelectedCardsKindForSelectCardsEffect = (
  effect: SequenceSegmentEffect,
): SavedSelectedCardsKind | undefined => {
  if (
    effect.type !== "selectCards" ||
    !isSupportedHandSelectionCardFilter(effect.filter) ||
    !Number.isInteger(effect.min) ||
    !Number.isInteger(effect.max) ||
    effect.min < 0 ||
    effect.max < effect.min
  ) {
    return undefined;
  }
  if (
    effect.zone === "hand" &&
    effect.player === effect.chooser &&
    (effect.player === "self" || effect.player === "opponent") &&
    (effect.visibility === "chooserOnly" || effect.visibility === "bothPlayers")
  ) {
    return "hand";
  }
  if (
    effect.zone === "trash" &&
    (effect.player === "self" || effect.player === "opponent") &&
    (effect.chooser === "self" || effect.chooser === "opponent") &&
    effect.visibility === "bothPlayers"
  ) {
    return "trash";
  }
  if (
    effect.zone === "costArea" &&
    (effect.player === "self" || effect.player === "opponent") &&
    effect.chooser === "self" &&
    effect.visibility === "bothPlayers"
  ) {
    return "don";
  }
  return undefined;
};

const validateExplicitSelectedCardsKind = (
  explicit: SequenceSegment["saveResultKind"],
  inferred: SavedSelectedCardsKind | undefined,
): SavedSelectedCardsKindResolution => {
  if (explicit === undefined) {
    return inferred === undefined
      ? { valid: true }
      : { valid: true, kind: inferred };
  }
  if (explicit === "targets") {
    return { valid: true };
  }
  return explicit === inferred
    ? { valid: true, kind: explicit }
    : { valid: false };
};

export const savedSelectedCardsKindForSelectCardsSegment = (
  segment: SequenceSegment,
): SavedSelectedCardsKindResolution => {
  const inferred = inferredSelectedCardsKindForSelectCardsEffect(
    segment.effect,
  );
  return validateExplicitSelectedCardsKind(segment.saveResultKind, inferred);
};
```

Replace `savedSelectedCardsKindForSelectTargetsSegment` with:

```ts
export const savedSelectedCardsKindForSelectTargetsSegment = (
  segment: SequenceSegment,
): SavedSelectedCardsKindResolution => {
  if (segment.effect.type !== "selectTargets") {
    return { valid: true };
  }
  const inferred = requestSelectsCostAreaDon(segment.effect.request)
    ? "don"
    : undefined;
  return validateExplicitSelectedCardsKind(segment.saveResultKind, inferred);
};
```

Update `isSupportedSequenceSelectCardsSegment`:

```ts
export const isSupportedSequenceSelectCardsSegment = (
  segment: SequenceSegment,
): segment is SequenceSegment & { effect: SelectCardsEffect } => {
  const result = savedSelectedCardsKindForSelectCardsSegment(segment);
  return result.valid && result.kind !== undefined;
};
```

- [ ] **Step 4: Update sequence support call sites**

In `packages/engine-core/src/effect-runtime-sequence/support.ts`, update the `selectCards` branch:

```ts
if (isSupportedSequenceSelectCardsSegment(segment)) {
  const result = savedSelectedCardsKindForSelectCardsSegment(segment);
  if (!result.valid || result.kind === undefined) {
    return false;
  }
  supportState.savedSelectedCards.set(
    String(segment.effect.saveAs),
    result.kind,
  );
  supportState.savedSelectedCardMaxCounts.set(
    String(segment.effect.saveAs),
    segment.effect.max,
  );
  supportState.hasPendingDecisionSegment = true;
  return true;
}
```

In the `selectTargets` branch, pass the full segment:

```ts
const selectedCardsKind =
  savedSelectedCardsKindForSelectTargetsSegment(segment);
if (!selectedCardsKind.valid) {
  return false;
}
```

And update the save behavior:

```ts
if (
  segment.saveResultAs !== undefined &&
  selectedCardsKind.kind !== undefined
) {
  supportState.savedSelectedCards.set(
    segment.saveResultAs,
    selectedCardsKind.kind,
  );
}
```

- [ ] **Step 5: Verify engine test passes**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit only this task**

Run:

```powershell
git status --short --branch
git add packages/engine-core/src/effect-runtime-sequence/support/selection.ts packages/engine-core/src/effect-runtime-sequence/support.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
git commit -m "Validate explicit sequence save result kind"
```

---

### Task 3: Emit Explicit DON Kind From Card Parser

**Files:**

- Modify: `packages/cards/src/instructions/don-movement/attach-rested.ts`
- Test: `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`

- [ ] **Step 1: Write failing parser assertions**

In `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`, update each asserted DON source-selection segment with:

```ts
saveResultKind: "don",
```

At minimum this includes the costed owner-relative `selectTargets` source segment and the self-rested `selectCards` source segment with `saveResultAs: "donSelection:attach"`.

- [ ] **Step 2: Run parser test to verify it fails**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: FAIL because parser output does not yet include `saveResultKind`.

- [ ] **Step 3: Emit `saveResultKind: "don"` in all four parser producer sites**

In `packages/cards/src/instructions/don-movement/attach-rested.ts`, add `saveResultKind: "don"` to each segment that saves selected DON cards into `donAttachSelection`.

Generic source selection segment:

```ts
{
  id:
    source.player === "self" && source.sourceState === "rested"
      ? "select:rested-don"
      : "select:don-to-attach",
  connector: "always",
  saveResultAs: donAttachSelection,
  saveResultKind: "don",
  effect: sourceSelection,
},
```

Distributed target `selectCards` segment:

```ts
{
  id: "select:rested-don",
  connector: "always",
  saveResultAs: donAttachSelection,
  saveResultKind: "don",
  effect: {
    type: "selectCards",
    zone: "costArea",
    player: "self",
    chooser: "self",
    min: donQuantity.cardinality.min,
    max: donQuantity.cardinality.max,
    filter: { categories: ["don"], state: "rested" },
    saveAs: donAttachSelection,
    visibility: "bothPlayers",
  },
},
```

All-target distributed `selectCards` segment: make the same addition to the segment with `id: "select:rested-don"` inside `parseAllTargetDistributedRestedDonInstruction`.

Simple rested-DON-to-target `selectCards` segment: make the same addition to the segment with `id: "select:rested-don"` inside `parseAttachRestedDonToTarget`.

- [ ] **Step 4: Verify parser test passes**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit only this task**

Run:

```powershell
git status --short --branch
git add packages/cards/src/instructions/don-movement/attach-rested.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
git commit -m "Emit explicit DON save result kind"
```

---

### Task 4: Broaden Parser Regression Coverage

**Files:**

- Test: `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
- Test: `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`
- Test: `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`

- [ ] **Step 1: Update representative DON attachment parser expectations**

In each parser test file, find asserted source-selection segments with:

```ts
saveResultAs: "donSelection:attach",
```

For each segment where the selected cards are DON source cards, add:

```ts
saveResultKind: "don",
```

Do not add `saveResultKind` to target-selection segments such as `saveResultAs: "targetSelection:attach-don"` unless they are explicitly testing `saveResultKind: "targets"`.

- [ ] **Step 2: Run representative parser tests**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit only this task**

Run:

```powershell
git status --short --branch
git add packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
git commit -m "Cover explicit DON save result parser output"
```

---

### Task 5: Full Verification

**Files:**

- No source changes expected unless checks reveal issues.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd run test -- packages/types/src/effects.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts
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

Only run this if `git status --short` shows owned modified files from the explicit save-result work:

```powershell
git add <owned-changed-files>
git commit -m "Format explicit save result kind changes"
```

Expected: commit succeeds and pre-commit hook passes.

---

## Self-Review

- Spec coverage: The plan adds an explicit parser/runtime contract, validates explicit metadata in runtime support, updates parser producers, keeps fallback inference only when metadata is absent, and covers positive and negative behavior.
- Reviewer findings addressed:
  - Runtime helpers now receive full sequence segments, not inner effects.
  - Explicit `targets` prevents selected-card DON inference.
  - `selectCards` explicit kind is validated because parser emits it.
  - All four DON source producer sites in `attach-rested.ts` are named.
  - Commit steps require status checks and owned-file staging.
- Placeholder scan: No open placeholders remain.
- Type consistency: `saveResultKind` is segment metadata on `SequencedEffect`; runtime selection helpers use `SequenceSegment["saveResultKind"]`.
