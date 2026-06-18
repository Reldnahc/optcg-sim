import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const block = (
  params: Pick<
    EffectBlock,
    "category" | "effect" | "sourcePresencePolicy" | "trigger"
  >,
): EffectBlock => ({
  id: "effect:test" as EffectBlock["id"],
  ...params,
});

test("runtime admission accepts card-drawn as a reusable auto event trigger", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
        duration: { type: "thisTurn" },
      },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: {
        type: "cardDrawn",
        player: "self",
        phase: { not: "draw" },
      },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
