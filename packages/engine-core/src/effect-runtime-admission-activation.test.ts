import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const block = (
  params: Pick<
    EffectBlock,
    "category" | "effect" | "sourcePresencePolicy" | "trigger"
  > &
    Partial<
      Omit<
        EffectBlock,
        "category" | "effect" | "id" | "sourcePresencePolicy" | "trigger"
      >
    >,
): EffectBlock => ({
  id: "effect:test" as EffectBlock["id"],
  ...params,
});

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
};

test("runtime admission accepts start-of-turn activation through reusable sequence support", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "activate",
        trigger: { type: "startOfYourTurn" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              connector: "then",
              effect: { type: "drawUpTo", player: "self", count: 1 },
            },
          ],
        },
      }),
    ),
  );
});
