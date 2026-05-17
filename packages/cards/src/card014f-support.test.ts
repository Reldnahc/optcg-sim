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
const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-014F-BASE" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceTextHash: "sha256:source",
};

describe("CARD-014F generated support", () => {
  it.each([
    {
      cardId: "CARD-014F-OPTIONAL" as CardId,
      expectedCapabilities: [
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
        "optionalEffectBlock:onPlay:draw-1:self",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
      expectedEffectBlockFields: { optional: true },
      expectedRuleId: "exact:on-play:optional-effect:draw-1:self",
      sourceText: "[On Play] You may draw 1 card.",
    },
    {
      cardId: "CARD-014F-YOUR-TURN" as CardId,
      expectedCapabilities: [
        "category:auto",
        "condition:yourTurn",
        "effect:draw:self:count:positive-safe-integer",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
      expectedEffectBlockFields: { condition: { type: "yourTurn" } },
      expectedRuleId: "exact:condition:your-turn",
      sourceText: "[On Play] During your turn, draw 1 card.",
    },
    {
      cardId: "CARD-014F-ATTACHED-DON" as CardId,
      expectedCapabilities: [
        "category:auto",
        "condition:selfAttachedDonCount",
        "effect:draw:self:count:positive-safe-integer",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
      expectedEffectBlockFields: {
        condition: {
          op: "gte",
          target: { type: "self" },
          type: "attachedDonCount",
          value: 1,
        },
      },
      expectedRuleId: "exact:condition:self-attached-don-count",
      sourceText:
        "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    },
  ])(
    "supports $expectedRuleId with exact DSL and capability evidence",
    ({
      cardId,
      expectedCapabilities,
      expectedEffectBlockFields,
      expectedRuleId,
      sourceText,
    }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        validateEffectDefinition,
      });
      const effectBlock = index.entries[0]?.effectDefinition?.effects[0];

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        cardId,
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expectedCapabilities.map((capabilityId) => ({
          capabilityId,
          parserRuleId: expectedRuleId,
        })),
      );
      expect(effectBlock).toMatchObject({
        ...expectedEffectBlockFields,
        effect: { count: 1, player: "self", type: "draw" },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      });
      expect(effectBlock).not.toHaveProperty("conditionTiming");
      expect(effectBlock?.effect).not.toHaveProperty("optional");
      expect(effectBlock?.effect).not.toEqual(
        expect.objectContaining({ type: "conditional" }),
      );
    },
  );

  it.each([
    [
      "exact:on-play:optional-effect:draw-1:self",
      "optionalEffectBlock:onPlay:draw-1:self",
      "[On Play] You may draw 1 card.",
    ],
    [
      "exact:condition:your-turn",
      "condition:yourTurn",
      "[On Play] During your turn, draw 1 card.",
    ],
    [
      "exact:condition:self-attached-don-count",
      "condition:selfAttachedDonCount",
      "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    ],
    [
      "exact:on-play:optional-effect:draw-1:self",
      "category:auto",
      "[On Play] You may draw 1 card.",
    ],
    [
      "exact:condition:your-turn",
      "effect:draw:self:count:positive-safe-integer",
      "[On Play] During your turn, draw 1 card.",
    ],
    [
      "exact:condition:self-attached-don-count",
      "trigger:onPlay",
      "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    ],
    [
      "exact:on-play:optional-effect:draw-1:self",
      "sourcePresencePolicy:mustRemainInSameZone",
      "[On Play] You may draw 1 card.",
    ],
  ])(
    "keeps %s unsupported when %s evidence is missing",
    (expectedRuleId, missingCapabilityId, sourceText) => {
      const matrixWithoutCapability = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== missingCapabilityId,
          ),
      };
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            cardId: "CARD-014F-MISSING-CAPABILITY" as CardId,
            sourceText,
          },
        ],
        runtimeCapabilityMatrix: matrixWithoutCapability,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [
          {
            capabilityId: missingCapabilityId,
            code: "missing-runtime-capability",
            component: expectedRuleId,
          },
        ],
        missingCapabilityIds: [missingCapabilityId],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "unsupported",
      });
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    [
      "exact:on-play:optional-effect:draw-1:self",
      "[On Play] You may draw 1 card. Then rest 1 DON!!.",
    ],
    [
      "exact:condition:your-turn",
      "[On Play] During your turn, draw 1 card. Then rest 1 DON!!.",
    ],
    [
      "exact:condition:self-attached-don-count",
      "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card. Then rest 1 DON!!.",
    ],
  ])(
    "keeps %s residue unsupported while preserving parser rule evidence",
    (expectedRuleId, sourceText) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            cardId: "CARD-014F-RESIDUE" as CardId,
            sourceText,
          },
        ],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [{ code: "unparsed-span" }],
        parseStatus: "partial",
        parserRuleIds: [expectedRuleId],
        status: "unsupported",
      });
      expect(index.entries[0]?.support).toBeUndefined();
      expect(index.effectDefinitions).toEqual({});
    },
  );
});
