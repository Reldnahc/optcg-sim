# Explicit Sequence Save Result Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make parser-emitted sequence saved-result contracts explicit so runtime support does not have to guess that a `selectTargets` cost-area DON selection is a saved DON-card selection.

**Architecture:** Add an optional `saveResultKind` property to sequence segments beside the existing `saveResultAs` property. Parser code will emit this metadata for known producers, runtime support will validate and prefer the explicit metadata, and existing inference remains as a compatibility fallback until producers are migrated.

**Tech Stack:** TypeScript, Vitest, `@optcg/types`, `@optcg/cards`, `@optcg/engine-core`, `npm.cmd`/pnpm scripts.

---

## File Structure

- Modify `packages/types/src/effects.ts`
  - Owns the shared DSL/engine type contract.
  - Add a small exported union type for sequence saved-result kinds and add `saveResultKind?: SequenceSaveResultKind` to `SequencedEffect`.

- Modify `packages/types/src/effects.test.ts`
  - Type-level regression coverage for valid and invalid `saveResultKind` usage.

- Modify `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`
  - Owns selection segment support and saved selected-card kind derivation.
  - Add explicit-kind validation helpers here, not in generic sequence orchestration.

- Modify `packages/engine-core/src/effect-runtime-sequence/support.ts`
  - Consume the helper from `support/selection.ts`.
  - No new request-shape inference here.

- Modify `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`
  - Runtime regression for explicit `saveResultKind: "don"` on the parsed owner-relative DON flow.
  - Negative runtime support regression for mismatched explicit kind.

- Modify `packages/cards/src/instructions/don-movement/attach-rested.ts`
  - Emit explicit `saveResultKind: "don"` on the DON source selection segment.

- Modify `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`
  - Parser regression for costed owner-relative DON wording.

- Optional follow-up only if necessary: update other parser tests that use strict object equality and now need `saveResultKind` in expected output.

---

### Task 1: Add Shared Type Contract

**Files:**

- Modify: `packages/types/src/effects.ts`
- Test: `packages/types/src/effects.test.ts`

- [ ] **Step 1: Write the failing type test**

Add this test near the existing sequence/saved-reference type tests in `packages/types/src/effects.test.ts`:

```ts
test("TYP sequence segments can declare explicit saved result kinds", () => {
  const segment: SequencedEffect = {
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

  expect(segment.saveResultKind).toBe("don");

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

Add this invalid-kind compile assertion in the same test file near other `@ts-expect-error` checks:

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

Expected: FAIL with a TypeScript/Vitest compile error that `saveResultKind` does not exist on `SequencedEffect`.

- [ ] **Step 3: Add the minimal shared type**

In `packages/types/src/effects.ts`, add this exported type just before `export interface SequencedEffect`:

```ts
export type SequenceSaveResultKind =
  | "don"
  | "hand"
  | "trash"
  | "set"
  | "targets";
```

Then update `SequencedEffect`:

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

- [ ] **Step 5: Commit**

Run:

```powershell
git add packages/types/src/effects.ts packages/types/src/effects.test.ts
git commit -m "Add explicit sequence save result kind type"
```

---

### Task 2: Make Runtime Support Prefer Explicit Selection Kind

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

Add this new negative test after the existing parsed costed sequence test:

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

- [ ] **Step 2: Run the engine test to verify the negative test fails**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: FAIL because runtime still accepts `saveResultKind: "don"` by ignoring it or does not validate the mismatch.

- [ ] **Step 3: Add explicit-kind validation helper**

In `packages/engine-core/src/effect-runtime-sequence/support/selection.ts`, replace `savedSelectedCardsKindForSelectTargetsSegment` with this implementation shape:

```ts
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

const explicitSavedSelectedCardsKindForSelectTargetsSegment = (
  effect: SelectTargetsEffect,
): SavedSelectedCardsKind | false | undefined => {
  if (effect.saveResultKind === undefined) {
    return undefined;
  }
  if (effect.saveResultKind === "targets") {
    return undefined;
  }
  if (effect.saveResultKind === "don") {
    return requestSelectsCostAreaDon(effect.request) ? "don" : false;
  }
  return false;
};

export const savedSelectedCardsKindForSelectTargetsSegment = (
  effect: SequenceSegmentEffect,
): SavedSelectedCardsKind | false | undefined => {
  if (effect.type !== "selectTargets") {
    return undefined;
  }
  const explicit =
    explicitSavedSelectedCardsKindForSelectTargetsSegment(effect);
  if (explicit !== undefined) {
    return explicit;
  }
  return requestSelectsCostAreaDon(effect.request) ? "don" : undefined;
};
```

Then update `packages/engine-core/src/effect-runtime-sequence/support.ts` in the `selectTargets` branch:

```ts
const selectedCardsKind = savedSelectedCardsKindForSelectTargetsSegment(
  segment.effect,
);
if (selectedCardsKind === false) {
  return false;
}
```

Keep the existing save behavior:

```ts
if (segment.saveResultAs !== undefined && selectedCardsKind !== undefined) {
  supportState.savedSelectedCards.set(segment.saveResultAs, selectedCardsKind);
}
```

- [ ] **Step 4: Verify engine test passes**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add packages/engine-core/src/effect-runtime-sequence/support/selection.ts packages/engine-core/src/effect-runtime-sequence/support.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
git commit -m "Validate explicit sequence save result kind"
```

---

### Task 3: Emit Explicit DON Kind From Card Parser

**Files:**

- Modify: `packages/cards/src/instructions/don-movement/attach-rested.ts`
- Test: `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`

- [ ] **Step 1: Write the failing parser assertion**

In `packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts`, update the owner-relative costed DON attachment expected source selection segment to include:

```ts
{
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

Also update the simpler self-rested `selectCards` expected source segment in the same file to include:

```ts
saveResultKind: "don",
```

on the segment that already has `saveResultAs: "donSelection:attach"`.

- [ ] **Step 2: Run parser test to verify it fails**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: FAIL because parser output does not yet include `saveResultKind`.

- [ ] **Step 3: Emit `saveResultKind: "don"` in the parser helper**

In `packages/cards/src/instructions/don-movement/attach-rested.ts`, update the first sequence segment returned by the attach-DON helper:

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

- [ ] **Step 4: Verify parser test passes**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add packages/cards/src/instructions/don-movement/attach-rested.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
git commit -m "Emit explicit DON save result kind"
```

---

### Task 4: Broaden Regression Coverage Without Expanding Scope

**Files:**

- Test: `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`
- Test: `packages/cards/src/card-effect-line-parser-don-attachment.test.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts`

- [ ] **Step 1: Update representative DON attachment parser expectations**

In `packages/cards/src/card-effect-line-parser-don-sequence.test.ts`, find the tests that assert a DON source segment with:

```ts
saveResultAs: "donSelection:attach",
```

For each asserted DON source segment, add:

```ts
saveResultKind: "don",
```

Do the same in `packages/cards/src/card-effect-line-parser-don-attachment.test.ts` for asserted DON source segments.

- [ ] **Step 2: Run representative parser tests**

Run:

```powershell
npm.cmd run test -- packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run runtime regression again**

Run:

```powershell
npm.cmd run test -- packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add packages/cards/src/card-effect-line-parser-don-sequence.test.ts packages/cards/src/card-effect-line-parser-don-attachment.test.ts packages/cards/src/card-effect-line-parser-costed-don-attachment.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets-owner-constraint.test.ts
git commit -m "Cover explicit DON save result parser output"
```

---

### Task 5: Full Verification And Final Commit Hygiene

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

Expected: clean working tree on the implementation branch.

- [ ] **Step 4: If any formatter-only changes remain, commit them**

Only run this if `git status --short` shows modified files:

```powershell
git add <changed-files>
git commit -m "Format explicit save result kind changes"
```

Expected: commit succeeds and pre-commit hook passes.

---

## Self-Review

- Spec coverage: The plan adds an explicit parser/runtime contract, makes parser emit it for DON attachment, makes runtime validate it, keeps fallback inference for compatibility, and adds positive and negative tests.
- Placeholder scan: No placeholder tasks remain; every code-changing step names exact files and code shape.
- Type consistency: The plan uses `saveResultKind` consistently across `SequencedEffect`, parser output, and engine support. The runtime helper returns `SavedSelectedCardsKind | false | undefined`, where `false` means explicit metadata was present but invalid for the request shape.
