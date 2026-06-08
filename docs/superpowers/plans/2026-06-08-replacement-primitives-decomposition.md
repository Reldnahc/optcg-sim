# Replacement Primitives Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/engine-core/src/replacement/primitives.ts` into cohesive replacement support-admission modules while preserving the existing public import path and replacement detection behavior.

**Architecture:** Keep `replacement/primitives.ts` as the stable public barrel for existing callers. Move replacement candidate types, detection errors, source/definition lookup, support-shape predicates, target validation, applicability/cost checks, and detection orchestration into private modules under `packages/engine-core/src/replacement/primitives/`. Add Phase 4 support-shape tests proving replacement support is reusable across trigger and instead-effect combinations, not certified by one exact replacement wrapper/body pair.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, existing engine-core replacement runtime helpers.

---

## Scope

This slice covers one remaining Phase 3 runtime decomposition target plus its Phase 4 guardrail:

- Decompose `packages/engine-core/src/replacement/primitives.ts`.
- Preserve imports from `./replacement/primitives.js` and `./effect-runtime-replacement-primitives.js`.
- Preserve runtime behavior for supported K.O. and field-removal replacement candidate detection.
- Preserve the existing `detectSupportedFieldRemovalReplacementCandidate` alias.
- Add a small-barrel package boundary test so `replacement/primitives.ts` cannot become a dumping ground again.
- Add focused Phase 4 tests for replacement support admission across trigger and instead-effect variation.
- Commit each coherent step.

This slice does not change `packages/engine-core/src/replacement/field-removal-process.ts`; that remains the final Phase 3 decomposition target after this slice.

## File Structure

Create these private replacement primitive modules:

- `packages/engine-core/src/replacement/primitives/types.ts`
  - Owns exported failure reasons, candidate/result types, `SupportedReplacementEffectBlock`, located-card/source types, and validated target types.
- `packages/engine-core/src/replacement/primitives/errors.ts`
  - Owns `detectionError` and `failure`.
- `packages/engine-core/src/replacement/primitives/source-lookup.ts`
  - Owns card/source lookup helpers: `findCardByInstanceId`, `toPublicFieldCardRef`, and `replacementSourcesForController`.
- `packages/engine-core/src/replacement/primitives/definition-lookup.ts`
  - Owns `effectIdFromReplacementProcess` and `resolveReviewedImplementedDslEffectDefinition`.
- `packages/engine-core/src/replacement/primitives/support-shapes.ts`
  - Owns replacement effect block support predicates and exports `isSupportedReplacementEffectBlock`.
- `packages/engine-core/src/replacement/primitives/target-validation.ts`
  - Owns validation of replacement process targets against current public field state.
- `packages/engine-core/src/replacement/primitives/applicability.ts`
  - Owns covered-target and cost/applicability checks for opponent field-removal replacements.
- `packages/engine-core/src/replacement/primitives/detection.ts`
  - Owns `detectSupportedSelectedTargetKoReplacementCandidate` and `detectSupportedFieldRemovalReplacementCandidate`.

Modify these existing files:

- `packages/engine-core/src/replacement/primitives.ts`
  - Replace with a public barrel that re-exports candidate/result types, `isSupportedReplacementEffectBlock`, and detection functions.
- `packages/engine-core/src/package-boundary.test.ts`
  - Add a file-size/cohesion guard for the public replacement primitives barrel.
- `packages/engine-core/src/replacement/primitives-support.test.ts`
  - Add Phase 4 cross-product support-admission tests.

Focused behavior coverage to keep green:

- `packages/engine-core/src/replacement/primitives-support.test.ts`
- `packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts`
- `packages/engine-core/src/runtime/primitives/target.test.ts`
- `packages/engine-core/src/replacement/multiple-candidate.test.ts`
- `packages/engine-core/src/replacement/field-removal-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts`
- `packages/engine-core/src/replacement/choice-response.test.ts`

## Task 1: Add A Failing Replacement Primitives Barrel Guard

**Files:**

- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append this test near the existing runtime file-size guards:

```ts
test("replacement primitives stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/replacement/primitives.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 180,
    `replacement/primitives.ts should be a public barrel over focused replacement support modules; found ${String(lineCount)} lines`,
  );
});
```

- [ ] **Step 2: Run the new guard and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "replacement primitives stays a small public barrel"
```

Expected: FAIL. The failure message reports that `replacement/primitives.ts` has about 1057 lines.

- [ ] **Step 3: Commit nothing**

Do not commit the failing test alone. Keep it unstaged until the extracted modules make it pass.

## Task 2: Add Phase 4 Replacement Support Admission Coverage

**Files:**

- Create: `packages/engine-core/src/replacement/primitives-support.test.ts`

- [ ] **Step 1: Add support-shape cross-product tests**

Create `packages/engine-core/src/replacement/primitives-support.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Effect,
  EffectDefinition,
  EffectId,
  ReplacementTrigger,
} from "@optcg/types";

import { isSupportedReplacementEffectBlock } from "./primitives.js";

const toEffectId = (value: string): EffectId => value as EffectId;

const allSelfCharacters = {
  type: "all",
  zone: "characterArea",
  player: "self",
} as const;

const wouldMoveFromCharacterArea = (): ReplacementTrigger => ({
  type: "wouldMoveZone",
  from: "characterArea",
  sourceKind: "cardEffect",
  target: allSelfCharacters,
});

const wouldBeKodByCardEffect = (): ReplacementTrigger => ({
  type: "wouldBeKOd",
  sourceKind: "cardEffect",
  target: allSelfCharacters,
});

const restSelfInstead = (): Extract<Effect, { type: "rest" }> => ({
  type: "rest",
  target: { type: "self" },
});

const returnDonInstead = (): Extract<Effect, { type: "returnDon" }> => ({
  type: "returnDon",
  count: 1,
  player: "self",
});

const replacementBlock = (
  id: string,
  when: ReplacementTrigger,
  instead: Effect,
): EffectDefinition["effects"][number] => ({
  id: toEffectId(id),
  category: "replacement",
  trigger: { type: "replacement", replacement: when },
  optional: true,
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  effect: {
    type: "replacement",
    when,
    instead,
  },
});

test("replacement support admits the same rest-self instead primitive under move-zone and K.O. triggers", () => {
  const blocks = [
    replacementBlock(
      "replacement-rest-self-move-zone",
      wouldMoveFromCharacterArea(),
      restSelfInstead(),
    ),
    replacementBlock(
      "replacement-rest-self-ko",
      wouldBeKodByCardEffect(),
      restSelfInstead(),
    ),
  ];

  assert.deepEqual(
    blocks.map((block) => isSupportedReplacementEffectBlock(block)),
    [true, true],
  );
});

test("replacement support admits the same move-zone trigger with multiple instead primitives", () => {
  const blocks = [
    replacementBlock(
      "replacement-move-zone-rest-self",
      wouldMoveFromCharacterArea(),
      restSelfInstead(),
    ),
    replacementBlock(
      "replacement-move-zone-return-don",
      wouldMoveFromCharacterArea(),
      returnDonInstead(),
    ),
  ];

  assert.deepEqual(
    blocks.map((block) => isSupportedReplacementEffectBlock(block)),
    [true, true],
  );
});
```

- [ ] **Step 2: Run the new test and verify it passes before refactor**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/primitives-support.test.ts
```

Expected: PASS. This is characterization coverage for existing support-admission behavior before moving code.

- [ ] **Step 3: Commit nothing**

Keep this test unstaged until the implementation commit that keeps it green.

## Task 3: Extract Primitive Types And Detection Errors

**Files:**

- Create: `packages/engine-core/src/replacement/primitives/types.ts`
- Create: `packages/engine-core/src/replacement/primitives/errors.ts`
- Modify: `packages/engine-core/src/replacement/primitives.ts`

- [ ] **Step 1: Create `types.ts`**

Move these declarations from `primitives.ts` unchanged into `types.ts`:

- `SelectedTargetKoReplacementDetectionFailureReason`
- `SelectedTargetKoReplacementCandidate`
- `FieldRemovalReplacementCandidate`
- `DetectSelectedTargetKoReplacementCandidateResult`
- `DetectFieldRemovalReplacementCandidateResult`
- `LocatedCard`
- `LocatedReplacementSource`
- `SupportedReplacementEffectBlock`
- `ValidatedReplacementTarget`

`ValidatedReplacementTarget` should become an explicit exported type:

```ts
export type ValidatedReplacementTarget = {
  located: LocatedCard;
  ref: CardRef;
  resolved: ResolvedCard;
};
```

- [ ] **Step 2: Create `errors.ts`**

Move `detectionError` and `failure` unchanged into `errors.ts`, importing `EngineError` and `SelectedTargetKoReplacementDetectionFailureReason`.

- [ ] **Step 3: Update `primitives.ts` imports and exports**

Import moved types/helpers from the new modules and re-export the public types from `primitives.ts`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/primitives-support.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/replacement/primitives/types.ts packages/engine-core/src/replacement/primitives/errors.ts packages/engine-core/src/replacement/primitives-support.test.ts
git commit -m "refactor(engine): extract replacement primitive result types"
```

## Task 4: Extract Source And Definition Lookup

**Files:**

- Create: `packages/engine-core/src/replacement/primitives/source-lookup.ts`
- Create: `packages/engine-core/src/replacement/primitives/definition-lookup.ts`
- Modify: `packages/engine-core/src/replacement/primitives.ts`

- [ ] **Step 1: Create `source-lookup.ts`**

Move these helpers unchanged from `primitives.ts`:

- `findCardByInstanceId`
- `toPublicFieldCardRef`
- `replacementSourcesForController`

Export each helper because later private modules consume them.

- [ ] **Step 2: Create `definition-lookup.ts`**

Move these helpers unchanged from `primitives.ts`:

- `hasHumanReviewMetadata`
- `resolveReviewedImplementedDslEffectDefinition`
- `effectIdFromReplacementProcess`

Only export `resolveReviewedImplementedDslEffectDefinition` and `effectIdFromReplacementProcess`.

- [ ] **Step 3: Update `primitives.ts` imports**

Remove the moved helpers from `primitives.ts`, import them from the new modules, and keep public exports unchanged.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/primitives-support.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/replacement/primitives/source-lookup.ts packages/engine-core/src/replacement/primitives/definition-lookup.ts
git commit -m "refactor(engine): extract replacement primitive lookup"
```

## Task 5: Extract Support Shapes And Target Validation

**Files:**

- Create: `packages/engine-core/src/replacement/primitives/support-shapes.ts`
- Create: `packages/engine-core/src/replacement/primitives/target-validation.ts`
- Modify: `packages/engine-core/src/replacement/primitives.ts`

- [ ] **Step 1: Create `support-shapes.ts`**

Move replacement support predicates from `primitives.ts` into `support-shapes.ts`, including:

- `isSelfTarget`
- `isSupportedSelfKoDrawReplacementEffect`
- `isSupportedOpponentFieldRemovalLifeReplacementEffect`
- `isSupportedOpponentEffectFieldRemovalRestCardsReplacementEffect`
- `isSupportedOpponentEffectFieldRemovalReplacementEffect`
- `isSupportedOpponentEffectFieldRemovalRestSelfReplacementEffect`
- `isSupportedOpponentEffectKoRestSelfReplacementEffect`
- `isSupportedOpponentKoTrashFromHandReplacementEffect`
- `isSupportedSelfKoTrashFromHandReplacementEffect`
- `isSupportedReplacementEffect`
- `isReplacementTriggerEffect`
- `isSupportedReplacementEffectBlock`

Prefer the existing exported instead-effect predicates from `../instead-effects.js` over duplicating local instead-effect predicate bodies.

- [ ] **Step 2: Create `target-validation.ts`**

Move these helpers from `primitives.ts`:

- `validateKoReplacementTarget`
- `validateKoReplacementTargets`

Import `findCardByInstanceId` from `source-lookup.ts`, `cardRefsEqual` from `../field-removal-targets.js`, and `failure` from `errors.ts`.

- [ ] **Step 3: Update `primitives.ts` imports**

Remove the moved predicates and validation helpers from `primitives.ts`, import the public helpers from `support-shapes.ts` and `target-validation.ts`, and preserve public exports.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/primitives-support.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/replacement/primitives/support-shapes.ts packages/engine-core/src/replacement/primitives/target-validation.ts
git commit -m "refactor(engine): extract replacement support shapes"
```

## Task 6: Extract Applicability And Detection Orchestration

**Files:**

- Create: `packages/engine-core/src/replacement/primitives/applicability.ts`
- Create: `packages/engine-core/src/replacement/primitives/detection.ts`
- Replace: `packages/engine-core/src/replacement/primitives.ts`
- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Create `applicability.ts`**

Move these helpers from `primitives.ts`:

- `opponentFieldRemovalReplacementCoveredTargets`
- `canPayOpponentFieldRemovalReplacementCost`
- `replacementRestCandidateIsActive`
- `fieldRemovalSourceKindMatches`
- `isOpponentControlledFieldRemovalProcess`

Export `opponentFieldRemovalReplacementCoveredTargets`; keep the other helpers private.

- [ ] **Step 2: Create `detection.ts`**

Move `toReplacementCandidateId`, `detectSupportedSelectedTargetKoReplacementCandidate`, and `detectSupportedFieldRemovalReplacementCandidate` from `primitives.ts` into `detection.ts`.

- [ ] **Step 3: Replace `primitives.ts` with the public barrel**

The full contents of `packages/engine-core/src/replacement/primitives.ts` should be:

```ts
export {
  detectSupportedFieldRemovalReplacementCandidate,
  detectSupportedSelectedTargetKoReplacementCandidate,
} from "./primitives/detection.js";
export { isSupportedReplacementEffectBlock } from "./primitives/support-shapes.js";
export type {
  DetectFieldRemovalReplacementCandidateResult,
  DetectSelectedTargetKoReplacementCandidateResult,
  FieldRemovalReplacementCandidate,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./primitives/types.js";
```

- [ ] **Step 4: Run focused tests and the barrel guard**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "replacement primitives stays a small public barrel"
corepack pnpm exec vitest run packages/engine-core/src/replacement/primitives-support.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts packages/engine-core/src/replacement/choice-response.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/replacement/primitives/applicability.ts packages/engine-core/src/replacement/primitives/detection.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract replacement primitive detection"
```

## Task 7: Final Verification

**Files:**

- Verify all files changed by this plan.

- [ ] **Step 1: Run formatting, lint, and typecheck**

Run:

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused replacement tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/replacement/primitives-support.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts packages/engine-core/src/replacement/choice-response.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run canonical repo verification**

Run:

```bash
corepack pnpm test
corepack pnpm verify
corepack pnpm coverage
```

Expected: PASS. If socket-bound match-server tests fail in the sandbox with `listen EPERM: operation not permitted 127.0.0.1`, rerun the same command with escalation.

- [ ] **Step 4: Record final line counts**

Run:

```bash
wc -l packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/replacement/primitives/*.ts packages/engine-core/src/replacement/field-removal-process.ts
```

Expected: `replacement/primitives.ts` is under 180 lines; no new private module is over 1000 lines; `field-removal-process.ts` remains the final Phase 3 target.

- [ ] **Step 5: Confirm clean worktree**

Run:

```bash
git status --short
```

Expected: no output.

## Completion Notes

- Spec coverage: Phase 3 replacement primitive decomposition is covered by Tasks 3-6; Phase 4 support-admission coverage is covered by Task 2.
- Type consistency: public replacement candidate/result type exports remain available from `replacement/primitives.ts` and `effect-runtime-replacement-primitives.ts`.
- Residual risk: this refactor does not reduce `replacement/field-removal-process.ts`; that remains the final Phase 3 decomposition target after this slice.
