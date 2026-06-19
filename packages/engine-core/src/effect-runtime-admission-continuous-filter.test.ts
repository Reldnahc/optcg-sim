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

test("runtime admission accepts auto modifyPower targets with exclude-self filters", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: {
              anyOf: [
                { categories: ["leader"] },
                { categories: ["character"], excludeSelf: true },
              ],
            },
          },
        },
        value: 1000,
        duration: { type: "thisTurn" },
      },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "whenAttacking" },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});

test("runtime admission accepts permanent all-player Character attack restrictions with anyOf filters", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "permanent",
      effect: {
        type: "cannotAttack",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            anyOf: [
              { cost: { op: "eq", value: 3 } },
              { cost: { op: "eq", value: 4 } },
            ],
          },
        },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "hasCardInZone",
            player: "self",
            zone: "leaderArea",
            filter: { categories: ["leader"], names: ["Buggy"] },
          },
        },
      },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "permanent" },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
