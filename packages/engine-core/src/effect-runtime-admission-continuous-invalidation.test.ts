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
  id: "effect:continuous-invalidation" as EffectBlock["id"],
  ...params,
});

test("runtime admission accepts permanent continuous effect invalidation sequences", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "permanent",
      trigger: { type: "permanent" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "invalidateEffects",
              target: { type: "myLeader" },
              duration: { type: "whileSourceOnField" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "invalidateEffects",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: {
                  categories: ["character"],
                  typesNotIncludeAny: ["Roger Pirates"],
                },
              },
              duration: { type: "whileSourceOnField" },
            },
          },
        ],
      },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
