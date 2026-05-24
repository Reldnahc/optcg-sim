import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCardEffectLine } from "../../packages/cards/src/card-effect-line-parser.ts";
import { isSupportedNoChoiceOnPlayDrawEffect } from "../../packages/engine-core/src/effect-runtime.ts";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "../../packages/engine-core/src/effect-runtime-sequence-support.ts";

const parseEffectBlock = (text) => {
  const parsed = parseCardEffectLine(text);
  assert.ok(parsed !== undefined, `expected parser to support: ${text}`);

  return {
    id: "cards-engine-contract:effect",
    ...parsed.block,
  };
};

test("cards parser emits an On Play draw primitive block accepted by engine draw support", () => {
  const effectBlock = parseEffectBlock("[On Play] Draw 1 card.");

  assert.equal(isSupportedNoChoiceOnPlayDrawEffect(effectBlock), true);
});

test("cards parser emits a DON-return On Play draw block accepted by engine sequence support", () => {
  const effectBlock = parseEffectBlock("[On Play] DON!! −1: Draw 1 card.");

  assert.equal(
    isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "onPlay",
      "mustRemainInSameZone",
    ),
    true,
  );
});
