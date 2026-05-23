import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import {
  optionalTrashCostKoComponentEvidenceId,
  optionalTrashCostKoParserCertificationIds,
  optionalTrashCostKoParserRuleId,
} from "./optional-trash-cost-ko-evidence.js";
import { parseCertifiedCardText } from "./certified-card-text-parser.js";
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
): EffectDefinitionValidationResult =>
  validateSchema(definition)
    ? { valid: true }
    : {
        errors: (validateSchema.errors ?? []).map((error) =>
          `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
        ),
        valid: false,
      };

const cardId = "SYNTHETIC-SUP-002E-PARSE" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-SUP-002E-BASE" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw 1 card.",
  sourceTextHash: "sha256:source",
};
const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

describe("optional trash cost K.O. generated support", () => {
  it.each([
    {
      baseCostMax: 4,
      sourceText:
        "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
      trashCount: 1,
    },
    {
      baseCostMax: 7,
      sourceText:
        "[On Play] You may trash 3 cards from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 7 or less.",
      trashCount: 3,
    },
  ])(
    "parses optional hand-trash cost into filtered K.O. generated DSL ($sourceText)",
    ({ baseCostMax, sourceText, trashCount }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual([optionalTrashCostKoParserRuleId]);
      const [effectBlock] = result.effectDefinition.effects;
      expect(effectBlock).toMatchObject({
        category: "auto",
        id: toEffectId(
          `SYNTHETIC-SUP-002E-PARSE:auto-on-play-optional-trash-${String(trashCount)}-from-hand-ko-base-cost-${String(baseCostMax)}-or-less`,
        ),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      });
      expect(effectBlock?.effect).toMatchObject({
        effects: [
          {
            connector: "always",
            effect: {
              cost: {
                chooser: "self",
                count: trashCount,
                optional: true,
                type: "trashFromHand",
              },
              type: "payCost",
            },
            saveResultAs: "paidOptionalTrashFromHandCost",
          },
          {
            connector: "ifYouDo",
            effect: {
              request: {
                filter: {
                  categories: ["character"],
                  cost: { max: baseCostMax },
                },
                max: 1,
                min: 0,
                player: "opponent",
                visibility: "public",
              },
              type: "selectTargets",
            },
            saveResultAs: "selectedTarget",
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { target: { type: "savedFieldObject" }, type: "ko" },
          },
        ],
        type: "sequence",
      });
    },
  );

  it.each([
    {
      expectedParsedRuleIds: [optionalTrashCostKoParserRuleId],
      expectedSpanStart: 121,
      sourceText:
        "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less. Then draw 1 card.",
    },
    {
      expectedParsedRuleIds: [],
      expectedSpanStart: 0,
      sourceText:
        "[On Play] You may trash 1 card from your hand: Rest up to 1 of your opponent's Characters with a base cost of 4 or less.",
    },
    {
      expectedParsedRuleIds: [],
      expectedSpanStart: 0,
      sourceText:
        "[On Play] You may trash 1 card from your hand: K.O. up to 2 of your opponent's Characters with a base cost of 4 or less.",
    },
  ])(
    "fails closed when optional hand-trash K.O. text is only partially parsed ($sourceText)",
    ({ expectedParsedRuleIds, expectedSpanStart, sourceText }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("partial");
      if (result.status !== "partial") {
        throw new Error("Expected partial parse.");
      }
      const span = {
        end: sourceText.length,
        start: expectedSpanStart,
        text: sourceText.slice(expectedSpanStart),
      };
      expect(result.parsedRuleIds).toEqual(expectedParsedRuleIds);
      expect(result.unparsedSpans).toEqual([span]);
      expect(result.blockers[0]).toMatchObject({ code: "unparsed-span", span });
    },
  );

  it("supports optional hand-trash cost into filtered K.O. with runtime capability evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-SUP-002E-SYNTHETIC" as CardId,
          sourceText:
            "[On Play] You may trash 2 cards from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: optionalTrashCostKoParserCertificationIds,
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "CARD-SUP-002E-SYNTHETIC",
      componentEvidenceIds: [optionalTrashCostKoComponentEvidenceId],
      parseStatus: "complete",
      parserRuleIds: [optionalTrashCostKoParserRuleId],
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: "category:auto" }),
        expect.objectContaining({
          capabilityId: "payCost:trashFromHand:self:count-exact:optional",
        }),
        expect.objectContaining({
          capabilityId: "selectTargets:field:public:character:max1:cost-max",
        }),
        expect.objectContaining({
          capabilityId: "effect:ko:saved-field-object:characterArea:public",
        }),
        expect.objectContaining({
          capabilityId: "savedFieldObject:consumer:generic",
        }),
        expect.objectContaining({
          capabilityId: "savedSelectedTargets:producer",
        }),
        expect.objectContaining({ capabilityId: "sequence:genericFrames" }),
        expect.objectContaining({
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
        }),
        expect.objectContaining({ capabilityId: "trigger:onPlay" }),
      ]),
    );
  });

  it("keeps optional hand-trash filtered K.O. unsupported when optional-cost capability is missing", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-SUP-002E-MISSING-CAPABILITY" as CardId,
          sourceText:
            "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
        },
      ],
      runtimeCapabilityMatrix: {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) =>
              capability.id !==
              "payCost:trashFromHand:self:count-exact:optional",
          ),
      },
      parserCertificationEvidence: {
        currentCertificationIds: optionalTrashCostKoParserCertificationIds,
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "payCost:trashFromHand:self:count-exact:optional",
          code: "missing-runtime-capability",
          component: optionalTrashCostKoComponentEvidenceId,
        },
      ],
      missingCapabilityIds: ["payCost:trashFromHand:self:count-exact:optional"],
      parseStatus: "complete",
      parserRuleIds: [optionalTrashCostKoParserRuleId],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps optional hand-trash filtered K.O. unsupported when parser certification evidence is omitted", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-SUP-002E-OMITTED-CERTIFICATION" as CardId,
          sourceText:
            "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
        },
      ],
      validateEffectDefinition,
    });

    const blocker = index.entries[0]?.blockers.find(
      (item) => item.component === optionalTrashCostKoComponentEvidenceId,
    );
    expect(blocker).toMatchObject({
      code: "unsupported-primitive",
      diagnosticLayer: "review",
    });
    expect(blocker?.message).toContain("Missing parser certification");
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      parserRuleIds: [optionalTrashCostKoParserRuleId],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps optional hand-trash filtered K.O. unsupported when parser certification evidence is absent", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-SUP-002E-MISSING-CERTIFICATION" as CardId,
          sourceText:
            "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
        },
      ],
      parserCertificationEvidence: { currentCertificationIds: [] },
      validateEffectDefinition,
    });

    const blocker = index.entries[0]?.blockers.find(
      (item) => item.component === optionalTrashCostKoComponentEvidenceId,
    );
    expect(blocker).toMatchObject({
      code: "unsupported-primitive",
      diagnosticLayer: "review",
    });
    expect(blocker?.message).toContain("Missing parser certification");
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      parserRuleIds: [optionalTrashCostKoParserRuleId],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps optional hand-trash filtered K.O. unsupported when parser certification evidence is stale", () => {
    const staleCertificationId =
      "composition:on-play-optional-trash-ko-sequence";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-SUP-002E-STALE-CERTIFICATION" as CardId,
          sourceText:
            "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: optionalTrashCostKoParserCertificationIds,
        staleCertificationIds: [staleCertificationId],
      },
      validateEffectDefinition,
    });

    const blocker = index.entries[0]?.blockers.find(
      (item) => item.component === optionalTrashCostKoComponentEvidenceId,
    );
    expect(blocker).toMatchObject({
      code: "unsupported-primitive",
      diagnosticLayer: "review",
    });
    expect(blocker?.message).toContain(staleCertificationId);
    expect(blocker?.message).toContain("Stale parser certification");
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      parserRuleIds: [optionalTrashCostKoParserRuleId],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("certifies SUP-002B parser-rule links in runtime capability evidence", () => {
    for (const capabilityId of [
      "payCost:trashFromHand:self:count-exact:optional",
      "selectTargets:field:public:character:max1:cost-max",
    ]) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.supported).toBe(true);
      expect(capability?.supportedParserRuleIds).toContain(
        optionalTrashCostKoParserRuleId,
      );
    }
  });
});
