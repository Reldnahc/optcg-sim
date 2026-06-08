# Sequence Saved Field Object Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts` into cohesive saved-reference modules while preserving sequence runtime behavior and reusable saved-field-object support.

**Architecture:** Keep `saved-field-object.ts` as the stable public barrel for existing callers. Extract live field-object state transitions, saved-target resolution, continuous record materialization, and saved-field-object segment appliers into private modules under `packages/engine-core/src/effect-runtime-sequence/saved-field-object/`. Add a cohesion guard and run the existing cross-product saved-reference tests so this slice proves reusable primitive routing, not only smaller files.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, existing engine-core sequence runtime helpers.

---

## Scope

This slice covers one Phase 3 runtime decomposition target plus the relevant Phase 4 guardrail:

- Decompose `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`.
- Preserve the existing public import path `./saved-field-object.js`.
- Keep saved references primitive-shaped across KO, trash, rest, activate, and continuous restriction/power consumers.
- Add a small-barrel package boundary test so the file cannot silently become a dumping ground again.
- Commit each coherent step.

This slice does not change parser certificates, runtime admission reports, support probe output, replacement process ownership, or sequence runner ownership.

## File Structure

Create these private saved-field-object modules:

- `packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts`
  - Owns field object lookup, rest transitions, activate transitions, rest-protection adaptation, and DON activation restriction checks.
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts`
  - Owns conversion of saved target bindings and direct activate targets into concrete `CardRef[]` selections.
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts`
  - Owns continuous modifier target binding and continuous effect record construction for saved field objects.
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts`
  - Owns the five saved-field-object sequence segment appliers.

Modify these existing files:

- `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`
  - Keep as the stable public barrel that re-exports `restFieldObjects` and the five applier functions.
- `packages/engine-core/src/package-boundary.test.ts`
  - Add a file-size/cohesion guard for the public saved-field-object barrel.

Existing behavior coverage to keep green:

- `packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/don-activation.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/selected-trash.test.ts`

## Task 1: Add A Failing Saved-Field-Object Barrel Guard

**Files:**

- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append this test before `async function listProductionSourcePaths`:

```ts
test("effect runtime sequence saved-field-object stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 160,
    `effect-runtime-sequence/saved-field-object.ts should be a public barrel over focused saved-field-object modules; found ${String(lineCount)} lines`,
  );
});
```

- [ ] **Step 2: Run the new guard and verify it fails**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime sequence saved-field-object stays a small public barrel"
```

Expected: FAIL. The failure message reports that `saved-field-object.ts` has about 1011 lines.

- [ ] **Step 3: Commit nothing**

Do not commit the failing test alone. Keep it unstaged until the extracted modules make it pass.

## Task 2: Extract Field Object State

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`

- [ ] **Step 1: Create the state module**

Create `field-object-state.ts` by moving these definitions out of `saved-field-object.ts` without changing behavior:

```ts
const refsEqual = (left: CardRef, right: CardRef): boolean => ...

const restFieldObject = (
  state: GameState,
  target: CardRef,
): { changed: boolean; state: GameState } => ...

export const restFieldObjects = (
  state: GameState,
  targets: readonly CardRef[],
  attempt?: RestProtectionAttempt,
): { changed: boolean; state: GameState } => ...

export const findFieldObjectByRef = (
  state: GameState,
  target: CardRef,
): { card: CardInstance } | null => ...

export const restProtectionAttemptFromEntry = (
  entry: EffectQueueEntry,
): RestProtectionAttempt => ...

export const activateFieldObject = (
  state: GameState,
  entry: EffectQueueEntry,
  target: CardRef,
): { changed: boolean; state: GameState } => ...
```

Also move the private DON activation restriction helpers used by `activateFieldObject`:

```ts
const targetPlayerForDonActivationRestriction = (
  state: GameState,
  effect: ContinuousEffectRecord,
): PlayerId | undefined => ...

const isDonActivationPrevented = (
  state: GameState,
  entry: EffectQueueEntry,
  target: CardRef,
): boolean => ...
```

- [ ] **Step 2: Update imports in `saved-field-object.ts`**

Replace the moved local definitions with:

```ts
import {
  activateFieldObject,
  findFieldObjectByRef,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./saved-field-object/field-object-state.js";
```

Remove no-longer-used imports from the top-level file:

```ts
CardRef;
PlayerId;
applyRestProtection;
RestProtectionAttempt;
continuousEffectConditionPasses;
durationIsActive;
getOpponentId;
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/don-activation.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts
```

Expected: PASS. This proves rest/activate state transitions, DON activation restrictions, and rest-protection replacement integration still work through the public import path.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract saved field object state"
```

## Task 3: Extract Saved Target Resolution

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`

- [ ] **Step 1: Create the resolution module**

Move `resolveActivateTargets` into `saved-target-resolution.ts` and export it:

```ts
export const resolveActivateTargets = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Effect, { type: "activate" }>["target"],
  savedReferences: EffectExecutionFrame["savedReferences"],
): { ok: true; selectedTargets: CardRef[] } | { ok: false } => ...
```

Import `getOpponentId` only if a moved helper needs it. The activate-target resolver should keep using `resolveSavedFieldObjectKoSelection` for `target.type === "savedFieldObject"` so saved selected targets and produced objects keep a single validation door.

- [ ] **Step 2: Update imports in `saved-field-object.ts`**

Replace the moved local definition with:

```ts
import { resolveActivateTargets } from "./saved-field-object/saved-target-resolution.js";
```

Remove no-longer-used imports from the top-level file after TypeScript reports them.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/don-activation.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts
```

Expected: PASS. This proves saved target activation still works for DON and characters while KO saved-target resolution remains unchanged.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts
git commit -m "refactor(engine): extract saved target resolution"
```

## Task 4: Extract Continuous Record Materialization

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`

- [ ] **Step 1: Create the continuous record module**

Move these definitions into `continuous-records.ts`:

```ts
const exactTargetForSavedObject = (
  entry: EffectQueueEntry,
  card: CardRef,
  state: GameState,
  objectIndex: number,
): ContinuousEffectRecord["modifier"]["target"] => ...

export const continuousRecordForSavedObject = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment,
  target: CardRef,
  objectIndex: number,
): ContinuousEffectRecord | undefined => ...
```

Keep the supported body families exactly as they are today:

```ts
segment.effect.type === "modifyPower" ||
  segment.effect.type === "cannotBecomeActive" ||
  segment.effect.type === "cannotAttack" ||
  segment.effect.type === "cannotBlock" ||
  segment.effect.type === "preventBlockerActivation" ||
  segment.effect.type === "invalidateEffects";
```

- [ ] **Step 2: Update imports in `saved-field-object.ts`**

Replace the moved local definition with:

```ts
import { continuousRecordForSavedObject } from "./saved-field-object/continuous-records.js";
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts
```

Expected: PASS. This proves the same saved selected target can feed `modifyPower` plus a restriction, including a leader/character multi-zone target.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts
git commit -m "refactor(engine): extract saved field continuous records"
```

## Task 5: Extract Segment Appliers And Leave A Public Barrel

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts`
- Replace: `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts`

- [ ] **Step 1: Create the segment applier module**

Move these exported appliers into `segment-appliers.ts`:

```ts
export const applySavedFieldObjectKoSequenceSegment = (...) => ...
export const applySavedFieldObjectTrashSequenceSegment = (...) => ...
export const applySavedFieldObjectRestSequenceSegment = (...) => ...
export const applySavedFieldObjectActivateSequenceSegment = (...) => ...
export const applySavedFieldObjectRestrictionSequenceSegment = (...) => ...
```

Keep this local type in `segment-appliers.ts`:

```ts
type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};
```

The appliers should import their collaborators from the private modules:

```ts
import { continuousRecordForSavedObject } from "./continuous-records.js";
import {
  activateFieldObject,
  findFieldObjectByRef,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./field-object-state.js";
import { resolveActivateTargets } from "./saved-target-resolution.js";
```

- [ ] **Step 2: Replace `saved-field-object.ts` with the public barrel**

The full contents of `packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts` should be:

```ts
export { restFieldObjects } from "./saved-field-object/field-object-state.js";
export {
  applySavedFieldObjectActivateSequenceSegment,
  applySavedFieldObjectKoSequenceSegment,
  applySavedFieldObjectRestSequenceSegment,
  applySavedFieldObjectRestrictionSequenceSegment,
  applySavedFieldObjectTrashSequenceSegment,
} from "./saved-field-object/segment-appliers.js";
```

- [ ] **Step 3: Run the boundary guard and focused sequence tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime sequence saved-field-object stays a small public barrel"
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts packages/engine-core/src/effect-runtime-sequence/don-activation.test.ts packages/engine-core/src/effect-runtime-sequence/selected-trash.test.ts
```

Expected: PASS. The boundary guard should report no assertion failure, and the focused tests should preserve KO, trash, rest, activate, continuous restriction, multi-zone, and replacement-resume behavior.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract saved field object segment appliers"
```

## Task 6: Final Verification

**Files:**

- Inspect: all files changed by this plan.

- [ ] **Step 1: Format the changed files**

Run:

```bash
pnpm exec prettier --write docs/superpowers/plans/2026-06-08-sequence-saved-field-object-decomposition.md packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts
```

Expected: all listed files are formatted.

- [ ] **Step 2: Run narrow verification**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts packages/engine-core/src/effect-runtime-sequence/don-activation.test.ts packages/engine-core/src/effect-runtime-sequence/selected-trash.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run canonical verification**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
pnpm coverage
```

Expected: PASS for every command. If a command is missing, record the missing script name in the final response. If a command is too broad for the environment, record the reason and the narrower commands that ran instead.

- [ ] **Step 4: Check file sizes**

Run:

```bash
wc -l packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts
```

Expected: the public barrel is below 160 lines and no extracted module is near the prior 1000-line dumping-ground size.

- [ ] **Step 5: Commit final verification-only formatting if needed**

If Step 1 changed files after the Task 5 commit, run:

```bash
git add docs/superpowers/plans/2026-06-08-sequence-saved-field-object-decomposition.md packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/field-object-state.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/continuous-records.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts
git commit -m "chore(engine): format saved field object decomposition"
```

If Step 1 produced no file changes, do not create an empty commit.

## Self-Review

- Spec coverage: Phase 3 decomposition is covered by Tasks 2-5; Phase 4 guardrail is covered by Task 1 plus the focused saved-reference cross-product tests in Task 5.
- Authority order: the public barrel preserves existing callers, and extracted modules keep primitive saved-field-object consumers independent from exact card IDs or printed lines.
- Type consistency: all extracted APIs use existing `@optcg/types` types and existing `SupportedSequenceSegment`.
- Residual risk: this refactor does not reduce the size of `runner.ts`, `replacement/primitives.ts`, or `replacement/field-removal-process.ts`; those remain separate roadmap slices.
