import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, SelectionId } from "@optcg/types";

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

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
};

test("runtime admission accepts filtered hand-trash cost before selected attack retarget", () => {
  const selectionId = "targetSelection:change-attack-target" as SelectionId;
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "onOpponentAttack" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  chooser: "self",
                  optional: true,
                  filter: {
                    effectEntryPoint: {
                      mode: "with",
                      trigger: { type: "trigger" },
                    },
                  },
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "self",
                  zones: ["leaderArea", "characterArea"],
                  min: 1,
                  max: 1,
                  allowFewerIfUnavailable: false,
                  visibility: "public",
                  filter: { categories: ["leader", "character"] },
                },
              },
              saveResultAs: selectionId,
            },
            {
              connector: "then",
              effect: {
                type: "changeAttackTarget",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: selectionId,
                  },
                  zones: ["leaderArea", "characterArea"],
                  player: "self",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      }),
    ),
  );
});
