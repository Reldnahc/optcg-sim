import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const sourceFiles = [
  "packages/engine-core/src/effect-runtime.ts",
  "packages/engine-core/src/effect-runtime-trigger-order-decision.ts",
  "packages/engine-core/src/effect-runtime-hand-selection.ts",
  "packages/engine-core/src/effect-runtime-top-deck-placement.ts",
  "packages/engine-core/src/effect-runtime-queue/choice-decisions.ts",
  "packages/engine-core/src/effect-runtime-queue/target-decisions.ts",
  "packages/engine-core/src/effect-runtime-sequence/frame-decisions.ts",
  "packages/engine-core/src/effect-runtime-sequence/target-decisions.ts",
  "packages/engine-core/src/effect-runtime-sequence/select-targets.ts",
  "packages/engine-core/src/effect-runtime-sequence/selected-segments.ts",
  "packages/engine-core/src/effect-runtime-sequence/remainder.ts",
  "packages/engine-core/src/effect-runtime-sequence/quantity-decisions.ts",
  "packages/engine-core/src/effect-runtime-sequence/life-state.ts",
  "packages/engine-core/src/runtime/primitives/trash-from-hand.ts",
  "packages/engine-core/src/replacement/field-removal-process/pause.ts",
  "packages/engine-core/src/replacement/field-removal-process/accepted.ts",
] as const;

test("pending decision creators use the authored pending spotlight helper", () => {
  for (const path of sourceFiles) {
    const source = readFileSync(path, "utf8");
    assert.match(
      source,
      /appendPendingSpotlightEntryCreatedEvents/u,
      `${path} should anchor pending decisions with the shared helper`,
    );
  }
});
