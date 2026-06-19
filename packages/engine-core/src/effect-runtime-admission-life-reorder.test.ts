import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const onPlayBlock = (effect: EffectBlock["effect"]): EffectBlock => ({
  id: "effect:life-reorder" as EffectBlock["id"],
  category: "auto",
  trigger: { type: "onPlay" },
  sourcePresencePolicy: "mustRemainInSameZone",
  effect,
});

test.each([
  ["self", { type: "reorderLife", player: "self", viewer: "self" } as const],
  [
    "opponent",
    { type: "reorderLife", player: "opponent", viewer: "self" } as const,
  ],
])("runtime admission accepts %s Life reorder", (_name, effect) => {
  const report = evaluateEffectBlockRuntimeSupport(onPlayBlock(effect));

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});

test("runtime admission accepts Life deck-top extraction with remainder reorder", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    onPlayBlock({
      type: "moveLifeToDeckTopAndReorderRest",
      player: "self",
      viewer: "self",
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
