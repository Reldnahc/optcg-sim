import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

test("runtime admission accepts costed conditional Leader attack Blocker restriction", () => {
  const block: EffectBlock = {
    id: "effect:leader-attack-blocker-restriction" as EffectBlock["id"],
    category: "auto",
    trigger: { type: "main" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: {
              type: "restDon",
              count: 1,
              optional: true,
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "conditional",
            if: {
              type: "lifeCount",
              player: "self",
              op: "lte",
              value: 1,
            },
            then: {
              type: "preventBlockerActivation",
              target: { type: "myLeader" },
              duration: { type: "thisTurn" },
            },
          },
        },
      ],
    },
  };

  const report = evaluateEffectBlockRuntimeSupport(block);

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
