# Field Removal Process Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/engine-core/src/replacement/field-removal-process.ts` into cohesive process modules while preserving the public replacement process API and existing field-removal runtime behavior.

**Architecture:** Keep `replacement/field-removal-process.ts` as the stable public barrel for existing callers, including the legacy K.O. aliases. Move payload types, process builders, target normalization, pause/decision creation, accepted-replacement execution, and instead-effect execution into private modules under `packages/engine-core/src/replacement/field-removal-process/`. Use existing replacement runtime tests as the Phase 4 cross-product guardrail because they already cover the same field-removal process with multiple instead primitives: return DON, rest self, owner deck-bottom, trash-from-hand choice, and immediate no-choice replacement effects.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, existing engine-core replacement runtime helpers.

---

## Scope

This slice covers the final remaining Phase 3 runtime decomposition target plus Phase 4 regression coverage:

- Decompose `packages/engine-core/src/replacement/field-removal-process.ts`.
- Preserve imports from `./replacement/field-removal-process.js` and the existing legacy aliases in `replacement/ko-process.ts`.
- Preserve process construction for K.O., move-to-hand, and move-to-deck-bottom field-removal attempts.
- Preserve target normalization for stale field-removal processes.
- Preserve replacement pause behavior and hidden/private decision visibility.
- Preserve accepted replacement execution, including owner deck-bottom, rest target, trash-from-hand, pay-cost, continuous modifier, trash self, K.O. self, moveCards, and no-choice body execution.
- Add a small-barrel package boundary test so `field-removal-process.ts` cannot become a dumping ground again.
- Commit each coherent step.

This slice completes Phase 3 after the previous decompositions for runtime queue results, sequence saved-field-object, sequence runner, and replacement primitives.

## File Structure

Create these private field-removal process modules:

- `packages/engine-core/src/replacement/field-removal-process/types.ts`
  - Owns `SelectedTargetKoReplacementPayload`, `LocatedReplacementSource`, `LocatedKoTarget`, `PendingReplacementRestInsteadPayload`, `PendingReplacementTrashFromHandInsteadPayload`, and accepted-process result types.
- `packages/engine-core/src/replacement/field-removal-process/builders.ts`
  - Owns `buildKoReplacementProcess`, selected-target K.O. process builders, move-zone process builders, and legacy builder aliases.
- `packages/engine-core/src/replacement/field-removal-process/normalization.ts`
  - Owns `findKoTargetByInstanceId`, `normalizeSelectedTargetKoProcess`, and `normalizeFieldRemovalProcess`.
- `packages/engine-core/src/replacement/field-removal-process/pause.ts`
  - Owns `replacementCandidatesFromDetection`, `isReplacementCandidateArray`, `pauseSelectedTargetKoReplacementProcess`, and `pauseFieldRemovalReplacementProcess`.
- `packages/engine-core/src/replacement/field-removal-process/source-snapshot.ts`
  - Owns accepted-replacement source lookup, `toReplacementDrawSourceSnapshot`, `replacementInsteadTransformedPayload`, and `currentPublicFieldRefForInstance`.
- `packages/engine-core/src/replacement/field-removal-process/instead-executor.ts`
  - Owns `acceptedReplacementError` and `executeReplacementInsteadEffect`.
- `packages/engine-core/src/replacement/field-removal-process/accepted.ts`
  - Owns `executeAcceptedSelectedTargetKoReplacementProcess` and `executeAcceptedFieldRemovalReplacementProcess`.

Modify these existing files:

- `packages/engine-core/src/replacement/field-removal-process.ts`
  - Replace with a public barrel that re-exports process builders, normalizers, pause functions, accepted execution, replacement primitive detection exports, and public candidate/result types.
- `packages/engine-core/src/package-boundary.test.ts`
  - Add a file-size/cohesion guard for the public field-removal process barrel.

Focused behavior coverage to keep green:

- `packages/engine-core/src/replacement/field-removal-process-shape.test.ts`
- `packages/engine-core/src/replacement/field-removal-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts`
- `packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts`
- `packages/engine-core/src/replacement/choice-response.test.ts`
- `packages/engine-core/src/replacement/multiple-candidate.test.ts`
- `packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts`
- `packages/engine-core/src/runtime/primitives/target.test.ts`

## Task 1: Add A Failing Field Removal Process Barrel Guard

**Files:**

- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append this test near the existing runtime file-size guards:

```ts
test("replacement field-removal process stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/replacement/field-removal-process.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 220,
    `replacement/field-removal-process.ts should be a public barrel over focused field-removal process modules; found ${String(lineCount)} lines`,
  );
});
```

- [ ] **Step 2: Run the guard and verify it fails**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "replacement field-removal process stays a small public barrel"
```

Expected: FAIL. The failure message reports that `field-removal-process.ts` has about 1018 lines.

- [ ] **Step 3: Commit nothing**

Keep the failing guard unstaged until the final barrel passes.

## Task 2: Extract Process Types And Builders

**Files:**

- Create: `packages/engine-core/src/replacement/field-removal-process/types.ts`
- Create: `packages/engine-core/src/replacement/field-removal-process/builders.ts`
- Modify: `packages/engine-core/src/replacement/field-removal-process.ts`

- [ ] **Step 1: Create `types.ts`**

Move these declarations from `field-removal-process.ts` unchanged:

- `SelectedTargetKoReplacementPayload`
- `LocatedReplacementSource`
- `LocatedKoTarget`
- `PendingReplacementRestInsteadPayload`
- `PendingReplacementTrashFromHandInsteadPayload`

Export all moved declarations because later private modules consume them.

- [ ] **Step 2: Create `builders.ts`**

Move these exports unchanged:

- `buildKoReplacementProcess`
- `buildFieldRemovalKoReplacementProcess`
- `buildSelectedTargetKoReplacementProcess`
- `buildSelectedTargetFieldRemovalKoReplacementProcess`
- `buildSelectedTargetsFieldRemovalKoReplacementProcess`
- `buildSelectedTargetMoveZoneReplacementProcess`
- `buildSelectedTargetFieldRemovalMoveToHandReplacementProcess`
- `buildSelectedTargetFieldRemovalMoveZoneReplacementProcess`
- `buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess`

- [ ] **Step 3: Update `field-removal-process.ts`**

Import the moved types/builders, re-export the public builder symbols, and leave the remaining normalization, pause, and accepted-execution code local for now.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/field-removal-process-shape.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/field-removal-process.ts packages/engine-core/src/replacement/field-removal-process/types.ts packages/engine-core/src/replacement/field-removal-process/builders.ts
git commit -m "refactor(engine): extract field-removal process builders"
```

## Task 3: Extract Normalization And Pause

**Files:**

- Create: `packages/engine-core/src/replacement/field-removal-process/normalization.ts`
- Create: `packages/engine-core/src/replacement/field-removal-process/pause.ts`
- Modify: `packages/engine-core/src/replacement/field-removal-process.ts`

- [ ] **Step 1: Create `normalization.ts`**

Move these helpers unchanged:

- `findKoTargetByInstanceId`
- `normalizeSelectedTargetKoProcess`
- `normalizeFieldRemovalProcess`

- [ ] **Step 2: Create `pause.ts`**

Move these helpers unchanged:

- `replacementCandidatesFromDetection`
- `isReplacementCandidateArray`
- `pauseSelectedTargetKoReplacementProcess`
- `pauseFieldRemovalReplacementProcess`

- [ ] **Step 3: Update `field-removal-process.ts`**

Import/re-export the moved normalizer and pause functions. Keep accepted replacement execution local for now.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/replacement/field-removal-process-shape.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts packages/engine-core/src/replacement/choice-response.test.ts packages/engine-core/src/runtime/primitives/target.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-core/src/replacement/field-removal-process.ts packages/engine-core/src/replacement/field-removal-process/normalization.ts packages/engine-core/src/replacement/field-removal-process/pause.ts
git commit -m "refactor(engine): extract field-removal process pause flow"
```

## Task 4: Extract Accepted Replacement Execution

**Files:**

- Create: `packages/engine-core/src/replacement/field-removal-process/source-snapshot.ts`
- Create: `packages/engine-core/src/replacement/field-removal-process/instead-executor.ts`
- Create: `packages/engine-core/src/replacement/field-removal-process/accepted.ts`
- Modify: `packages/engine-core/src/replacement/field-removal-process.ts`
- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Create `source-snapshot.ts`**

Move these helpers unchanged:

- `findReplacementSource`
- `toReplacementDrawSourceSnapshot`
- `replacementInsteadTransformedPayload`
- `currentPublicFieldRefForInstance`

Export the helpers used by `accepted.ts` and `instead-executor.ts`.

- [ ] **Step 2: Create `instead-executor.ts`**

Move these helpers unchanged:

- `acceptedReplacementError`
- `executeReplacementInsteadEffect`

Export both helpers for `accepted.ts`.

- [ ] **Step 3: Create `accepted.ts`**

Move these exports unchanged:

- `executeAcceptedSelectedTargetKoReplacementProcess`
- `executeAcceptedFieldRemovalReplacementProcess`

- [ ] **Step 4: Replace `field-removal-process.ts` with the public barrel**

The full contents of `packages/engine-core/src/replacement/field-removal-process.ts` should re-export:

```ts
export {
  buildFieldRemovalKoReplacementProcess,
  buildKoReplacementProcess,
  buildSelectedTargetFieldRemovalKoReplacementProcess,
  buildSelectedTargetFieldRemovalMoveToHandReplacementProcess,
  buildSelectedTargetFieldRemovalMoveZoneReplacementProcess,
  buildSelectedTargetKoReplacementProcess,
  buildSelectedTargetMoveZoneReplacementProcess,
  buildSelectedTargetsFieldRemovalKoReplacementProcess,
  buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess,
} from "./field-removal-process/builders.js";
export {
  executeAcceptedFieldRemovalReplacementProcess,
  executeAcceptedSelectedTargetKoReplacementProcess,
} from "./field-removal-process/accepted.js";
export {
  normalizeFieldRemovalProcess,
  normalizeSelectedTargetKoProcess,
} from "./field-removal-process/normalization.js";
export {
  pauseFieldRemovalReplacementProcess,
  pauseSelectedTargetKoReplacementProcess,
} from "./field-removal-process/pause.js";
export {
  detectSupportedFieldRemovalReplacementCandidate,
  detectSupportedSelectedTargetKoReplacementCandidate,
} from "./primitives.js";
export type {
  DetectFieldRemovalReplacementCandidateResult,
  DetectSelectedTargetKoReplacementCandidateResult,
  FieldRemovalReplacementCandidate,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "./primitives.js";
```

- [ ] **Step 5: Run focused tests and the barrel guard**

Run:

```bash
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "replacement field-removal process stays a small public barrel"
corepack pnpm exec vitest run packages/engine-core/src/replacement/field-removal-process-shape.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts packages/engine-core/src/replacement/choice-response.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine-core/src/replacement/field-removal-process.ts packages/engine-core/src/replacement/field-removal-process/source-snapshot.ts packages/engine-core/src/replacement/field-removal-process/instead-executor.ts packages/engine-core/src/replacement/field-removal-process/accepted.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract field-removal accepted execution"
```

## Task 5: Final Verification

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
corepack pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/replacement/field-removal-process-shape.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts packages/engine-core/src/replacement/field-removal-owner-deck-bottom-runtime.test.ts packages/engine-core/src/replacement/choice-response.test.ts packages/engine-core/src/replacement/multiple-candidate.test.ts packages/engine-core/src/effect-runtime-filtered-ko-replacement.test.ts packages/engine-core/src/runtime/primitives/target.test.ts
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
wc -l packages/engine-core/src/replacement/field-removal-process.ts packages/engine-core/src/replacement/field-removal-process/*.ts packages/engine-core/src/replacement/primitives.ts packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts packages/engine-core/src/effect-runtime-queue/results.ts
```

Expected: no Phase 3 target remains over the hard 1000-line guard, and every public barrel is below its package-boundary guard.

- [ ] **Step 5: Confirm clean worktree**

Run:

```bash
git status --short
```

Expected: no output.

## Completion Notes

- Spec coverage: Phase 3 final runtime decomposition is covered by Tasks 2-4; Phase 4 cross-product coverage is preserved by the focused replacement runtime tests in Tasks 4-5.
- Type consistency: public replacement process exports remain available from `replacement/field-removal-process.ts` and through the legacy K.O. process barrel.
- Residual risk: accepted replacement execution is the highest-risk section; it must keep the same event ordering, replacement state payloads, hidden decision visibility, once-per-turn consumption, and uncovered-target continuation behavior.
