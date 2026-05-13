import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("generated support report", () => {
  it("summarizes supported and unsupported generated-support evidence deterministically", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
      ),
    };
    const missingCapabilityIndex = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-008D-003" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:source-3",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutDraw,
      validateEffectDefinition,
    });
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-008D-002" as CardId,
          sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
          sourceTextHash: "sha256:source-2",
        },
        {
          ...baseInput,
          cardId: "CARD-008D-001" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:source-1",
        },
        {
          ...baseInput,
          cardId: "CARD-008D-004" as CardId,
          sourceText: "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card.",
          sourceTextHash: "sha256:source-4",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport({
      ...index,
      entries: [...index.entries, ...missingCapabilityIndex.entries],
    });

    expect(report).toEqual({
      blockerCount: 2,
      blockers: [
        {
          cardId: "CARD-008D-002",
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: 41,
            start: 23,
            text: "Then rest 1 DON!!.",
          },
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          cardId: "CARD-008D-003",
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-n:self",
          message:
            "Missing runtime capability effect:draw:self:count:positive-safe-integer for parser rule exact:on-play:draw-n:self.",
        },
      ],
      missingRuntimeCapabilityIds: [
        "effect:draw:self:count:positive-safe-integer",
      ],
      parserRuleIdsUsed: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
      statusByCardId: {
        "CARD-008D-001": {
          blockerCodes: [],
          missingCapabilityIds: [],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "supported",
        },
        "CARD-008D-002": {
          blockerCodes: ["unparsed-span"],
          missingCapabilityIds: [],
          parseStatus: "partial",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "unsupported",
        },
        "CARD-008D-003": {
          blockerCodes: ["missing-runtime-capability"],
          missingCapabilityIds: [
            "effect:draw:self:count:positive-safe-integer",
          ],
          parseStatus: "complete",
          parserRuleIds: ["exact:on-play:draw-n:self"],
          status: "unsupported",
        },
        "CARD-008D-004": {
          blockerCodes: [],
          missingCapabilityIds: [],
          parseStatus: "complete",
          parserRuleIds: [
            "exact:on-play:draw-n:self",
            "exact:when-attacking:draw-n:self",
            "line-separated-effect-blocks:v1",
          ],
          status: "supported",
        },
      },
      supportedCardIds: ["CARD-008D-001", "CARD-008D-004"],
      totalCards: 4,
      unparsedSpans: [
        {
          cardId: "CARD-008D-002",
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
      unsupportedCardIds: ["CARD-008D-002", "CARD-008D-003"],
      unsupportedPrimitiveComponents: [],
    });
  });

  it("keeps unsupported primitive blockers visible when an index entry carries them", () => {
    const report = buildGeneratedSupportReport({
      effectDefinitions: {},
      entries: [
        {
          blockers: [
            {
              code: "unsupported-primitive",
              component: "effect:rest-don",
              message: "Resting DON is not covered by the runtime matrix.",
            },
          ],
          capabilityEvidence: [],
          cardId: "CARD-008D-005" as CardId,
          missingCapabilityIds: [],
          parseStatus: "unsupportedPrimitive",
          parserRuleIds: [],
          sourceTextHash: "sha256:source-5",
          status: "unsupported",
        },
      ],
    });

    expect(report.unsupportedPrimitiveComponents).toEqual(["effect:rest-don"]);
    expect(report.blockers).toEqual([
      {
        cardId: "CARD-008D-005",
        code: "unsupported-primitive",
        component: "effect:rest-don",
        message: "Resting DON is not covered by the runtime matrix.",
      },
    ]);
  });

  it("reports invalid draw-count blockers deterministically", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-009A-001" as CardId,
          sourceText: "[On Play] Draw 0 cards.",
          sourceTextHash: "sha256:invalid-count",
        },
      ],
      validateEffectDefinition,
    });

    const report = buildGeneratedSupportReport(index);

    expect(report).toMatchObject({
      blockerCount: 1,
      blockers: [
        {
          cardId: "CARD-009A-001",
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 23,
            start: 0,
            text: "[On Play] Draw 0 cards.",
          },
        },
      ],
      statusByCardId: {
        "CARD-009A-001": {
          blockerCodes: ["unparsed-span"],
          missingCapabilityIds: [],
          parseStatus: "partial",
          parserRuleIds: [],
          status: "unsupported",
        },
      },
      supportedCardIds: [],
      unsupportedCardIds: ["CARD-009A-001"],
    });
  });
});
