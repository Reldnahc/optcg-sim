import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const cardId = "CARD-018A-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

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
  if (valid) {
    return { valid: true };
  }

  return {
    errors: (validateSchema.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
};

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[Trigger] Draw 1 card.",
  sourceTextHash: "sha256:source",
};

describe("CARD-018A generated support", () => {
  it.each([
    {
      expectedEffectId: "CARD-018A-001:auto-trigger-draw-2",
      expectedParserRuleIds: ["exact:trigger:draw-n:self"],
      sourceText: "[Trigger] Draw 2 cards.",
      sourcePresencePolicy: "noSourceRequired",
      trigger: { type: "trigger" },
    },
    {
      expectedEffectId: "CARD-018A-001:auto-on-ko-draw-2",
      expectedParserRuleIds: ["exact:on-ko:draw-n:self"],
      sourceText: "[On K.O.] Draw 2 cards.",
      sourcePresencePolicy: "resolveFromDestinationZone",
      trigger: { type: "onKO" },
    },
  ])(
    "parses trigger-family draw components to generated DSL ($sourceText)",
    ({
      expectedEffectId,
      expectedParserRuleIds,
      sourcePresencePolicy,
      sourceText,
      trigger,
    }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual(expectedParserRuleIds);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: { count: 2, player: "self", type: "draw" },
          id: toEffectId(expectedEffectId),
          sourcePresencePolicy,
          trigger,
        },
      ]);
    },
  );

  it.each([
    {
      expectedEffectId: "CARD-018A-001:auto-trigger-draw-up-to-1",
      expectedParserRuleIds: ["exact:trigger:draw-up-to-n:self"],
      sourceText: "[Trigger] Draw up to 1 card.",
      sourcePresencePolicy: "noSourceRequired",
      trigger: { type: "trigger" },
    },
    {
      expectedEffectId: "CARD-018A-001:auto-on-ko-draw-up-to-1",
      expectedParserRuleIds: ["exact:on-ko:draw-up-to-n:self"],
      sourceText: "[On K.O.] Draw up to 1 card.",
      sourcePresencePolicy: "resolveFromDestinationZone",
      trigger: { type: "onKO" },
    },
  ])(
    "parses trigger-family draw-up-to components to generated DSL ($sourceText)",
    ({
      expectedEffectId,
      expectedParserRuleIds,
      sourcePresencePolicy,
      sourceText,
      trigger,
    }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual(expectedParserRuleIds);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: { count: 1, player: "self", type: "drawUpTo" },
          id: toEffectId(expectedEffectId),
          sourcePresencePolicy,
          trigger,
        },
      ]);
    },
  );

  it.each([
    {
      cardId: "CARD-018A-TRIGGER-DRAW" as CardId,
      expectedCapabilityId: "sourcePresencePolicy:noSourceRequired",
      expectedRuleId: "exact:trigger:draw-n:self",
      sourceText: "[Trigger] Draw 1 card.",
    },
    {
      cardId: "CARD-018A-ONKO-DRAW" as CardId,
      expectedCapabilityId: "sourcePresencePolicy:resolveFromDestinationZone",
      expectedRuleId: "exact:on-ko:draw-n:self",
      sourceText: "[On K.O.] Draw 1 card.",
    },
    {
      cardId: "CARD-018A-TRIGGER-DRAW-UP-TO" as CardId,
      expectedCapabilityId: "drawUpTo:self:chooseQuantity",
      expectedRuleId: "exact:trigger:draw-up-to-n:self",
      sourceText: "[Trigger] Draw up to 1 card.",
    },
    {
      cardId: "CARD-018A-ONKO-DRAW-UP-TO" as CardId,
      expectedCapabilityId: "drawUpTo:self:chooseQuantity",
      expectedRuleId: "exact:on-ko:draw-up-to-n:self",
      sourceText: "[On K.O.] Draw up to 1 card.",
    },
  ])(
    "supports wrapper/body composition for $expectedRuleId",
    ({ cardId, expectedCapabilityId, expectedRuleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: expectedCapabilityId,
            parserRuleId: expectedRuleId,
          }),
        ]),
      );
    },
  );

  it.each([
    {
      expectedCapabilityId: "trigger:trigger",
      expectedRuleId: "exact:trigger:draw-n:self",
      sourceText: "[Trigger] Draw 1 card.",
    },
    {
      expectedCapabilityId: "trigger:onKO",
      expectedRuleId: "exact:on-ko:draw-n:self",
      sourceText: "[On K.O.] Draw 1 card.",
    },
    {
      expectedCapabilityId: "modifyPower:choose:thisTurn:zeroChoiceBranch",
      expectedRuleId: "exact:on-play:modify-power:choose:this-turn",
      sourceText:
        "[On Play] Up to 1 of your opponent's Characters gets -2000 power during this turn.",
    },
  ])(
    "reports missing CARD-018A runtime capability evidence for $expectedRuleId",
    ({ expectedCapabilityId, expectedRuleId, sourceText }) => {
      const runtimeCapabilityMatrix = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities:
          generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== expectedCapabilityId,
          ),
      };

      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, sourceText }],
        runtimeCapabilityMatrix,
        validateEffectDefinition,
      });
      const report = buildGeneratedSupportReport(index);

      expect(index.entries[0]).toMatchObject({
        blockers: [
          {
            capabilityId: expectedCapabilityId,
            code: "missing-runtime-capability",
          },
        ],
        missingCapabilityIds: [expectedCapabilityId],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "unsupported",
      });
      expect(report.blockers[0]).toMatchObject({
        capabilityId: expectedCapabilityId,
        code: "missing-runtime-capability",
        deepestSuccessfulLayer: "schema",
        layer: "runtime-capability",
      });
    },
  );

  it.each([
    {
      sourceText: "[On K.O.] This Character gets +1000 power during this turn.",
    },
    {
      sourceText: "[On K.O.] This Character cannot attack during this turn.",
    },
    {
      sourceText:
        "[On K.O.] This Character gets +1000 power while this card is on the field.",
    },
  ])(
    "keeps unsupported On K.O. continuous source-policy shape fail-closed ($sourceText)",
    ({ sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, sourceText }],
        validateEffectDefinition,
      });
      const report = buildGeneratedSupportReport(index);

      expect(index.entries[0]).toMatchObject({
        blockers: [{ code: "unparsed-span" }],
        missingCapabilityIds: [],
        parseStatus: "partial",
        parserRuleIds: [],
        status: "unsupported",
      });
      expect(index.effectDefinitions).toEqual({});
      expect(report.blockers[0]).toMatchObject({
        code: "unparsed-span",
        layer: "parser",
      });
    },
  );
});
