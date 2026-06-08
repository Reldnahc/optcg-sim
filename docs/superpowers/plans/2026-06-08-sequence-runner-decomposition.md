# Sequence Runner Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/engine-core/src/effect-runtime-sequence/runner.ts` into cohesive sequence runner modules while preserving recursive sequence execution, pause/resume behavior, and Phase 4 composition coverage.

**Architecture:** Keep `runner.ts` as the stable public barrel for existing callers. Move public run types, empty segment/error helpers, continuous-record applicability, nested composition result checks, and no-decision segment orchestration into private modules under `packages/engine-core/src/effect-runtime-sequence/runner/`. Add a barrel-size guard plus cross-product composition tests that prove reusable sequence bodies still work through root, nested, and conditional composition doors.

**Tech Stack:** TypeScript strict mode, Vitest, pnpm workspaces, existing `@optcg/types`, existing engine-core sequence runtime helpers.

---

## Scope

This slice covers one remaining Phase 3 runtime decomposition target plus its Phase 4 composition guardrail:

- Decompose `packages/engine-core/src/effect-runtime-sequence/runner.ts`.
- Preserve existing imports from `./runner.js`.
- Preserve exported path helpers from `./paths.js`.
- Keep recursive no-decision segment execution working for root sequences, nested sequences, conditionals, decisions, continuous records, saved references, and field mutations.
- Add a small-barrel package boundary test so `runner.ts` cannot become a dumping ground again.
- Add focused Phase 4 tests for the same body primitive under root, nested, and conditional sequence composition.
- Commit each coherent step.

This slice does not change replacement runtime ownership or support-probe output.

## File Structure

Create these private runner modules:

- `packages/engine-core/src/effect-runtime-sequence/runner/types.ts`
  - Owns exported sequence-runner type aliases: sequence effect shapes, ledgers, trash decision callback, frame run result, frame resume result, and sequence runtime failure reason.
- `packages/engine-core/src/effect-runtime-sequence/runner/results.ts`
  - Owns `emptySegmentResult` and `sequenceRuntimeError`.
- `packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts`
  - Owns detection of whether materialized continuous records currently apply to any public or private card object.
- `packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts`
  - Owns detection of whether a nested or conditional child sequence changed state through segment results.
- `packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts`
  - Owns `continueNoDecisionSegments` and the no-decision sequence execution loop.

Modify these existing files:

- `packages/engine-core/src/effect-runtime-sequence/runner.ts`
  - Replace with a public barrel that re-exports path helpers, public types, `emptySegmentResult`, `sequenceRuntimeError`, and `continueNoDecisionSegments`.
- `packages/engine-core/src/package-boundary.test.ts`
  - Add a file-size/cohesion guard for the public runner barrel.
- `packages/engine-core/src/effect-runtime-sequence/frames.test.ts`
  - Add Phase 4 composition coverage for root, nested, and conditional sequence execution.

Existing behavior coverage to keep green:

- `packages/engine-core/src/effect-runtime-sequence/frames.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/cost-composition.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/filtered-cost-composition.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/search-reveal.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/select-targets.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts`
- `packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts`

## Task 1: Add A Failing Sequence Runner Barrel Guard

**Files:**

- Modify: `packages/engine-core/src/package-boundary.test.ts`

- [ ] **Step 1: Add the failing boundary test**

Append this test near the existing runtime file-size guards:

```ts
test("effect runtime sequence runner stays a small public barrel", async () => {
  const sourcePath = path.join(
    repoRoot,
    "packages/engine-core/src/effect-runtime-sequence/runner.ts",
  );
  const source = await readFile(sourcePath, "utf8");
  const lineCount = source.trimEnd().split("\n").length;

  assert.ok(
    lineCount <= 160,
    `effect-runtime-sequence/runner.ts should be a public barrel over focused runner modules; found ${String(lineCount)} lines`,
  );
});
```

- [ ] **Step 2: Run the new guard and verify it fails**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime sequence runner stays a small public barrel"
```

Expected: FAIL. The failure message reports that `runner.ts` has about 1011 lines.

- [ ] **Step 3: Commit nothing**

Do not commit the failing test alone. Keep it unstaged until the extracted modules make it pass.

## Task 2: Add Phase 4 Runner Composition Coverage

**Files:**

- Modify: `packages/engine-core/src/effect-runtime-sequence/frames.test.ts`

- [ ] **Step 1: Add a root/nested/conditional sequence body cross-product test**

Add this test after the existing sequence setup helpers in `frames.test.ts`:

```ts
test("sequence runner executes draw through root, nested, and conditional composition doors", () => {
  const state = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "root-draw",
        connector: "always",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        id: "nested-draw-sequence",
        connector: "then",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "nested-draw",
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
      {
        id: "conditional-draw",
        connector: "then",
        effect: {
          type: "conditional",
          if: { type: "handCount", player: "self", op: "gte", value: 0 },
          then: { type: "draw", player: "self", count: 1 },
        },
      },
    ],
  });
  const beforeHandCount = must(state.players[p1], "before p1").hand.length;
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const afterP1 = must(resolved.state.players[p1], "after p1");
  assert.equal(afterP1.hand.length, beforeHandCount + 3);
  assert.equal(afterP1.deck.length, beforeDeckCount - 3);
  const drawEvents = resolved.events.filter(
    (event) => event.type === "cardDrawn",
  );
  assert.equal(drawEvents.length, 3);
});
```

If `frames.test.ts` does not expose a compatible `sequenceQueueState` helper, add the same helper shape used by that file's existing tests rather than importing from another test file.

- [ ] **Step 2: Run the new test and verify it passes before refactor**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/frames.test.ts -t "sequence runner executes draw through root, nested, and conditional composition doors"
```

Expected: PASS. This is characterization coverage for existing behavior before moving code.

- [ ] **Step 3: Commit nothing**

Keep this test unstaged until the implementation commit that keeps it green.

## Task 3: Extract Runner Types And Result Helpers

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/runner/types.ts`
- Create: `packages/engine-core/src/effect-runtime-sequence/runner/results.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/runner.ts`

- [ ] **Step 1: Create `types.ts`**

Create `packages/engine-core/src/effect-runtime-sequence/runner/types.ts`:

```ts
import type {
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
} from "@optcg/types";

export type SequenceEffect = Extract<Effect, { type: "sequence" }>;
export type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
export type DrawEffect = Extract<Effect, { type: "draw" }>;
export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
export type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
export type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;

export type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type TrashDecisionResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; events: EngineEvent[]; ok: false; state: GameState };

export type CreateTrashFromHandSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
) => TrashDecisionResult;

export type SequenceFrameResumeResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; ok: false }
  | undefined;

export type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false };

export type SequenceRuntimeFailureReason =
  | "missing-frame"
  | "missing-queue-entry"
  | "missing-effect-block"
  | "unsupported-sequence-shape"
  | "segment-execution-failed";
```

- [ ] **Step 2: Create `results.ts`**

Create `packages/engine-core/src/effect-runtime-sequence/runner/results.ts`:

```ts
import type {
  EffectQueueEntry,
  EngineError,
  SequenceSegmentResult,
} from "@optcg/types";

import type { SequenceRuntimeFailureReason } from "./types.js";

interface SequenceRuntimeErrorDetails {
  reason: SequenceRuntimeFailureReason;
}

export const emptySegmentResult = (): SequenceSegmentResult => ({
  attempted: false,
  succeeded: false,
  changedState: false,
  selectedCards: [],
  selectedTargets: [],
  paidCost: false,
  playerDeclined: false,
});

export const sequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SequenceRuntimeFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SequenceRuntimeErrorDetails,
});
```

- [ ] **Step 3: Update `runner.ts` to import the extracted types/helpers**

Remove the moved type aliases and helper functions from `runner.ts`, then import:

```ts
import { emptySegmentResult, sequenceRuntimeError } from "./runner/results.js";
import type {
  CreateTrashFromHandSequenceDecision,
  DrawEffect,
  MoveCardsEffect,
  PayCostEffect,
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameResumeResult,
  SequenceFrameRunResult,
  SequenceSegmentEffect,
  TrashFromHandEffect,
} from "./runner/types.js";

export { emptySegmentResult, sequenceRuntimeError } from "./runner/results.js";
export type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
  SequenceFrameRunResult,
} from "./runner/types.js";
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/cost-composition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/types.ts packages/engine-core/src/effect-runtime-sequence/runner/results.ts packages/engine-core/src/effect-runtime-sequence/frames.test.ts
git commit -m "refactor(engine): extract sequence runner result types"
```

## Task 4: Extract Continuous And Composition Helpers

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts`
- Create: `packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts`
- Modify: `packages/engine-core/src/effect-runtime-sequence/runner.ts`

- [ ] **Step 1: Create `continuous-application.ts`**

Create `packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts`:

```ts
import type {
  CardInstance,
  ContinuousEffectRecord,
  GameState,
} from "@optcg/types";

import { cardMatchesContinuousModifierTarget } from "../../runtime/continuous/target-matching.js";

const currentCardsForContinuousMatching = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
    ...player.costArea,
    ...player.hand,
    ...player.trash,
    ...player.deck,
    ...player.donDeck,
    ...player.life.map((lifeCard) => lifeCard.card),
  ]);

const continuousRecordCurrentlyApplies = (
  state: GameState,
  record: ContinuousEffectRecord,
): boolean => {
  const target = record.modifier.target;
  if (target.type === "player" || target.type === "allMatching") {
    return true;
  }
  return currentCardsForContinuousMatching(state).some((card) =>
    cardMatchesContinuousModifierTarget(state, card, record),
  );
};

export const continuousRecordsCurrentlyApply = (
  state: GameState,
  records: readonly ContinuousEffectRecord[],
): boolean =>
  records.some((record) => continuousRecordCurrentlyApplies(state, record));
```

- [ ] **Step 2: Create `composition-results.ts`**

Create `packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts`:

```ts
import type { EffectExecutionFrame } from "@optcg/types";

import { segmentKeyForPath } from "../paths.js";
import type { SequenceEffect } from "./types.js";

export const sequenceSegmentResultsChanged = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  effectPath: readonly string[],
): boolean =>
  effect.effects.some((segment, index) => {
    const result =
      segmentResults[segmentKeyForPath(effectPath, segment, index)];
    return (
      result !== undefined &&
      result.attempted &&
      result.succeeded &&
      result.changedState
    );
  });
```

- [ ] **Step 3: Update `runner.ts` imports**

Remove the moved continuous/composition helper definitions from `runner.ts`, then import:

```ts
import { continuousRecordsCurrentlyApply } from "./runner/continuous-application.js";
import { sequenceSegmentResultsChanged } from "./runner/composition-results.js";
```

Remove no-longer-used imports:

```ts
CardInstance;
ContinuousEffectRecord;
cardMatchesContinuousModifierTarget;
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets.test.ts packages/engine-core/src/effect-runtime-sequence/cost-composition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts
git commit -m "refactor(engine): extract sequence runner composition helpers"
```

## Task 5: Extract No-Decision Runner And Leave A Public Barrel

**Files:**

- Create: `packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts`
- Replace: `packages/engine-core/src/effect-runtime-sequence/runner.ts`

- [ ] **Step 1: Create `no-decision-runner.ts`**

Move `continueNoDecisionSegments` from `runner.ts` into `runner/no-decision-runner.ts`, keeping the full function body and changing only imports.

The new module must import its private collaborators:

```ts
import { sequenceSegmentResultsChanged } from "./composition-results.js";
import { continuousRecordsCurrentlyApply } from "./continuous-application.js";
import { emptySegmentResult, sequenceRuntimeError } from "./results.js";
import type {
  CreateTrashFromHandSequenceDecision,
  DrawEffect,
  MoveCardsEffect,
  PayCostEffect,
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
  SequenceSegmentEffect,
  TrashFromHandEffect,
} from "./types.js";
```

The module must import existing sequence helpers using `../` or `../../` relative paths because it is inside the new `runner/` folder.

- [ ] **Step 2: Replace `runner.ts` with the public barrel**

The full contents of `packages/engine-core/src/effect-runtime-sequence/runner.ts` should be:

```ts
export {
  resolveSequenceForPath,
  segmentKey,
  segmentKeyForPath,
} from "./paths.js";
export { continueNoDecisionSegments } from "./runner/no-decision-runner.js";
export { emptySegmentResult, sequenceRuntimeError } from "./runner/results.js";
export type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
  SequenceFrameRunResult,
} from "./runner/types.js";
```

- [ ] **Step 3: Run the boundary guard and focused sequence tests**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts -t "effect runtime sequence runner stays a small public barrel"
pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/cost-composition.test.ts packages/engine-core/src/effect-runtime-sequence/filtered-cost-composition.test.ts packages/engine-core/src/effect-runtime-sequence/search-reveal.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts
```

Expected: PASS. The public runner barrel should be below 160 lines, and the focused tests should preserve root, nested, conditional, pausing, resume, saved-reference, and continuous-target behavior.

- [ ] **Step 4: Commit**

Run:

```bash
git add packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts packages/engine-core/src/package-boundary.test.ts
git commit -m "refactor(engine): extract sequence no-decision runner"
```

## Task 6: Final Verification

**Files:**

- Inspect: all files changed by this plan.

- [ ] **Step 1: Format the changed files**

Run:

```bash
pnpm exec prettier --write docs/superpowers/plans/2026-06-08-sequence-runner-decomposition.md packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/types.ts packages/engine-core/src/effect-runtime-sequence/runner/results.ts packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts
```

Expected: all listed files are formatted.

- [ ] **Step 2: Run narrow verification**

Run:

```bash
pnpm exec vitest run packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/cost-composition.test.ts packages/engine-core/src/effect-runtime-sequence/filtered-cost-composition.test.ts packages/engine-core/src/effect-runtime-sequence/search-reveal.test.ts packages/engine-core/src/effect-runtime-sequence/select-targets.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-multizone.test.ts packages/engine-core/src/effect-runtime-sequence/saved-field-object-bounce-replacement.test.ts
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

Expected: PASS for every command. If a command needs socket permissions, rerun it with escalation and record the sandbox failure reason in the final response.

- [ ] **Step 4: Check file sizes**

Run:

```bash
wc -l packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/types.ts packages/engine-core/src/effect-runtime-sequence/runner/results.ts packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts
```

Expected: the public barrel is below 160 lines and no extracted module is near the prior 1000-line dumping-ground size.

- [ ] **Step 5: Commit final verification-only formatting if needed**

If Step 1 changed files after Task 5, run:

```bash
git add docs/superpowers/plans/2026-06-08-sequence-runner-decomposition.md packages/engine-core/src/package-boundary.test.ts packages/engine-core/src/effect-runtime-sequence/frames.test.ts packages/engine-core/src/effect-runtime-sequence/runner.ts packages/engine-core/src/effect-runtime-sequence/runner/types.ts packages/engine-core/src/effect-runtime-sequence/runner/results.ts packages/engine-core/src/effect-runtime-sequence/runner/continuous-application.ts packages/engine-core/src/effect-runtime-sequence/runner/composition-results.ts packages/engine-core/src/effect-runtime-sequence/runner/no-decision-runner.ts
git commit -m "chore(engine): format sequence runner decomposition"
```

If Step 1 produced no file changes, do not create an empty commit.

## Self-Review

- Spec coverage: Phase 3 runner decomposition is covered by Tasks 3-5; Phase 4 composition coverage is covered by Task 2.
- Authority order: the public `./runner.js` import path remains stable, and no card IDs, printed lines, shape IDs, runtime capability IDs, or generated inventory rows are introduced as support authority.
- Type consistency: public runner type exports remain available from `runner.ts`, while private modules consume direct local type imports.
- Residual risk: this refactor does not reduce `replacement/primitives.ts` or `replacement/field-removal-process.ts`; those remain the final Phase 3 decomposition targets after this slice.
