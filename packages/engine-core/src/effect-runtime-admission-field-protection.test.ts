import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

test("runtime admission accepts all-target field-removal protection by self effects", () => {
  const block: EffectBlock = {
    id: "effect:all-target-field-protection" as EffectBlock["id"],
    category: "permanent",
    trigger: { type: "permanent" },
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "giveProtection",
      target: {
        type: "all",
        player: "opponent",
        zone: "characterArea",
        filter: { categories: ["character"] },
      },
      protection: {
        process: "fieldRemoval",
        fieldRemoval: {
          processFamily: "fieldRemoval",
          classification: "moveFromFieldToOtherZone",
          sourceKind: "cardEffect",
          sourceControllerRelation: "selfControlled",
          targetScope: "anyFieldCard",
          exclusions: {
            battleKO: "excluded",
            ruleProcessTrash: "excluded",
            controllerCost: "excluded",
            controllerOwnedEffect: "excluded",
            ambiguousCustomRemoval: "failClosed",
          },
        },
      },
      duration: { type: "whileSourceOnField" },
    },
  };

  const report = evaluateEffectBlockRuntimeSupport(block);

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
