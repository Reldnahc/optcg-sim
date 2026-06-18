import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

test("runtime admission accepts permanent keyword grants gated by field-count condition", () => {
  const block: EffectBlock = {
    id: "effect:conditional-permanent-keyword" as EffectBlock["id"],
    category: "permanent",
    trigger: { type: "permanent" },
    sourcePresencePolicy: "mustRemainInSameZone",
    condition: {
      type: "fieldCount",
      player: "self",
      op: "gte",
      value: 1,
      filter: {
        categories: ["character"],
        colorsAny: ["purple"],
        typesAny: ["Big Mom Pirates"],
        nameNot: ["Charlotte Anana"],
      },
    },
    effect: {
      type: "giveKeyword",
      target: { type: "self" },
      keyword: "blocker",
      duration: {
        type: "whileConditionTrue",
        condition: {
          type: "fieldCount",
          player: "self",
          op: "gte",
          value: 1,
          filter: {
            categories: ["character"],
            colorsAny: ["purple"],
            typesAny: ["Big Mom Pirates"],
            nameNot: ["Charlotte Anana"],
          },
        },
      },
    },
  };

  const report = evaluateEffectBlockRuntimeSupport(block);

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});

test("runtime admission accepts permanent all-target K.O. protection with name exclusion", () => {
  const block: EffectBlock = {
    id: "effect:conditional-permanent-protection" as EffectBlock["id"],
    category: "permanent",
    trigger: { type: "permanent" },
    sourcePresencePolicy: "mustRemainInSameZone",
    condition: {
      type: "cardState",
      target: { type: "self" },
      state: "active",
    },
    effect: {
      type: "protectFromKO",
      target: {
        type: "all",
        player: "self",
        zone: "characterArea",
        filter: {
          categories: ["character"],
          typesAny: ["Example"],
          cost: { max: 4 },
          nameNot: ["Excluded"],
        },
      },
      sourceKind: "cardEffect",
      sourceControllerRelation: "eitherController",
      duration: {
        type: "whileConditionTrue",
        condition: {
          type: "cardState",
          target: { type: "self" },
          state: "active",
        },
      },
    },
  };

  const report = evaluateEffectBlockRuntimeSupport(block);

  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
});
