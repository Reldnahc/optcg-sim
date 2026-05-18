import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "contracts/effect-dsl.schema.json"), "utf8"),
) as unknown;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema as AnySchema);
const returnDonPlaySelectedRuleId =
  "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected";
const sourceText =
  "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it.";
const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-014E-SYNTHETIC" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText,
  sourceTextHash: "sha256:source",
};

const validateEffectDefinition = (
  definition: EffectDefinition,
): EffectDefinitionValidationResult => {
  const valid = validateSchema(definition);
  return valid
    ? { valid: true }
    : {
        errors: (validateSchema.errors ?? []).map((error) =>
          `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
        ),
        valid: false,
      };
};

describe("return-DON playSelected generated support", () => {
  it("supports exact synthetic text with cost, hand-selection, and playSelected evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "CARD-014E-SYNTHETIC",
      parseStatus: "complete",
      parserRuleIds: [returnDonPlaySelectedRuleId],
      status: "supported",
      support: {
        cardId: "CARD-014E-SYNTHETIC",
        effectDefinitionId: "card-014e-synthetic.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.effectDefinition?.effects[0]?.effect).toEqual({
      effects: [
        {
          connector: "always",
          effect: {
            cost: { count: 1, optional: true, type: "returnDon" },
            type: "payCost",
          },
          saveResultAs: "paidReturnDonCost",
        },
        {
          connector: "ifYouDo",
          effect: {
            chooser: "self",
            filter: { categories: ["character"] },
            max: 1,
            min: 0,
            player: "self",
            saveAs: "handSelection:playableCharacter",
            type: "selectCards",
            visibility: "chooserOnly",
            zone: "hand",
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            enterRested: true,
            ignoreCost: true,
            selection: "handSelection:playableCharacter",
            type: "playSelected",
          },
        },
      ],
      type: "sequence",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "payCost:returnDon:self:count-exact",
          component: "on-play-return-don-then-play-selected-character",
          parserRuleId: returnDonPlaySelectedRuleId,
        }),
        expect.objectContaining({
          capabilityId: "returnDon:cost:self:count-exact",
          component: "on-play-return-don-then-play-selected-character",
          parserRuleId: returnDonPlaySelectedRuleId,
        }),
        expect.objectContaining({
          capabilityId: "selectCards:hand:self:character:max1",
          component: "on-play-return-don-then-play-selected-character",
          parserRuleId: returnDonPlaySelectedRuleId,
        }),
        expect.objectContaining({
          capabilityId: "playSelected:hand:character:max1",
          component: "on-play-return-don-then-play-selected-character",
          parserRuleId: returnDonPlaySelectedRuleId,
        }),
        expect.objectContaining({
          capabilityId: "playSelected:hand:character:max1:ignoreCost",
          component: "on-play-return-don-then-play-selected-character",
          parserRuleId: returnDonPlaySelectedRuleId,
        }),
      ]),
    );
  });

  it.each([
    "payCost:returnDon:self:count-exact",
    "returnDon:cost:self:count-exact",
    "selectCards:hand:self:character:max1",
    "playSelected:hand:character:max1",
    "playSelected:hand:character:max1:ignoreCost",
  ])("blocks support when %s capability is missing", (capabilityId) => {
    const index = buildGeneratedSupportIndex({
      cards: [
        { ...baseCard, cardId: "CARD-014E-MISSING-CAPABILITY" as CardId },
      ],
      runtimeCapabilityMatrix: {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== capabilityId,
          ),
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId,
          code: "missing-runtime-capability",
          component: "on-play-return-don-then-play-selected-character",
        },
      ],
      missingCapabilityIds: [capabilityId],
      parseStatus: "complete",
      parserRuleIds: [returnDonPlaySelectedRuleId],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });
});
