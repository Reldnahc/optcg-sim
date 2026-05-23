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
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

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
const parserCertificationEvidence = {
  currentCertificationIds: listAllGeneratedSupportParserCertificationIds(),
} as const;

describe("CARD-014F generated support", () => {
  it.each([
    {
      cardId: "CARD-014F-OPTIONAL" as CardId,
      expectedCapabilities: [
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
        "optionalEffectBlock:onPlay:draw-n:self",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
      expectedComponent: "on-play-optional-draw",
      expectedEffectBlockFields: { optional: true },
      expectedRuleId: "exact:on-play:optional-effect:draw-n:self",
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
      expectedComponent: "on-play-condition-your-turn-draw",
      expectedEffectBlockFields: { condition: { type: "yourTurn" } },
      expectedRuleId: "exact:condition:your-turn:draw-n",
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
      expectedComponent: "on-play-condition-self-attached-don-count-draw",
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
      expectedComponent,
      expectedEffectBlockFields,
      expectedRuleId,
      sourceText,
    }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        parserCertificationEvidence,
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
          component: expectedComponent,
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
      "exact:on-play:optional-effect:draw-n:self",
      "optionalEffectBlock:onPlay:draw-n:self",
      "[On Play] You may draw 1 card.",
    ],
    [
      "exact:condition:your-turn:draw-n",
      "condition:yourTurn",
      "[On Play] During your turn, draw 1 card.",
    ],
    [
      "exact:condition:self-attached-don-count",
      "condition:selfAttachedDonCount",
      "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    ],
    [
      "exact:on-play:optional-effect:draw-n:self",
      "category:auto",
      "[On Play] You may draw 1 card.",
    ],
    [
      "exact:condition:your-turn:draw-n",
      "effect:draw:self:count:positive-safe-integer",
      "[On Play] During your turn, draw 1 card.",
    ],
    [
      "exact:condition:self-attached-don-count",
      "trigger:onPlay",
      "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    ],
    [
      "exact:on-play:optional-effect:draw-n:self",
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
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [
          {
            capabilityId: missingCapabilityId,
            code: "missing-runtime-capability",
          },
        ],
        missingCapabilityIds: [missingCapabilityId],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "unsupported",
      });
      expect(index.entries[0]?.blockers[0]?.component).toEqual(
        expect.any(String),
      );
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    [
      "exact:on-play:optional-effect:draw-n:self",
      "[On Play] You may draw 1 card. Then rest 1 DON!!.",
    ],
    [
      "exact:condition:your-turn:draw-n",
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
        parserCertificationEvidence,
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
