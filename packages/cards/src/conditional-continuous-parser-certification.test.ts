import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { conditionalContinuousNonBaseConditionParserCertificationIds } from "./conditional-continuous-composition-evidence.js";
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = (definition: EffectDefinition) => {
  void definition;
  return { valid: true } as const;
};

describe("conditional continuous non-base-power parser certification", () => {
  it.each([
    {
      cardId: "SUP-002F-OMITTED-CERT-DIRECT-KEYWORD",
      expectedCertificationIds: [
        "condition:trashCount:self:gte:7",
        "body:keyword-grant:self-character",
        "keyword:granted:allowlisted",
      ],
      sourceText:
        "If you have 7 or more cards in your trash, this Character gains [Rush].",
    },
    {
      cardId: "SUP-002F-OMITTED-CERT-DIRECT-PROTECTION",
      expectedCertificationIds: [
        "condition:leaderColorCount:self:gte:2",
        "body:protection:opponent-effect-field-removal",
      ],
      sourceText:
        "If your Leader is multicolored, this Character cannot be removed from the field by your opponent's effects.",
    },
    {
      cardId: "SUP-002F-OMITTED-CERT-SEQUENCE-MIXED",
      expectedCertificationIds: [
        "condition:fieldCount:don:self:lte:6",
        "body:keyword-grant:self-character",
        "keyword:granted:allowlisted",
        "body:protection:opponent-effect-field-removal",
        "composition:sequence:ordered-effects",
      ],
      sourceText:
        "If you have 6 or less DON!! cards on your field, this Character cannot be removed from the field by your opponent's effects and gains [Rush].",
    },
  ])(
    "fails closed when parser certification evidence is omitted ($cardId)",
    ({ cardId, expectedCertificationIds, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: cardId as CardId,
            sourceText,
            sourceTextHash: `sha256:${cardId.toLowerCase()}`,
          },
        ],
        validateEffectDefinition,
      });

      for (const certificationId of expectedCertificationIds) {
        const blocker = index.entries[0]?.blockers.find((item) =>
          item.message.includes(certificationId),
        );
        expect(blocker).toMatchObject({
          code: "unsupported-primitive",
          diagnosticLayer: "review",
        });
        expect(blocker?.message).toContain("Missing parser certification");
      }
      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    {
      cardId: "SUP-002F-STALE-CERT-DIRECT-KEYWORD",
      staleId: "condition:trashCount:self:gte:7",
      sourceText:
        "If you have 7 or more cards in your trash, this Character gains [Rush].",
    },
    {
      cardId: "SUP-002F-STALE-CERT-DIRECT-KEYWORD-BODY",
      staleId: "body:keyword-grant:self-character",
      sourceText:
        "If you have 7 or more cards in your trash, this Character gains [Rush].",
    },
    {
      cardId: "SUP-002F-STALE-CERT-DIRECT-PROTECTION",
      staleId: "condition:leaderColorCount:self:gte:2",
      sourceText:
        "If your Leader is multicolored, this Character cannot be removed from the field by your opponent's effects.",
    },
    {
      cardId: "SUP-002F-STALE-CERT-DIRECT-PROTECTION-BODY",
      staleId: "body:protection:opponent-effect-field-removal",
      sourceText:
        "If your Leader is multicolored, this Character cannot be removed from the field by your opponent's effects.",
    },
    {
      cardId: "SUP-002F-STALE-CERT-SEQUENCE-MIXED",
      staleId: "condition:fieldCount:don:self:lte:6",
      sourceText:
        "If you have 6 or less DON!! cards on your field, this Character cannot be removed from the field by your opponent's effects and gains [Rush].",
    },
  ])(
    "fails closed when parser certification evidence is stale ($cardId)",
    ({ cardId, staleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: cardId as CardId,
            sourceText,
            sourceTextHash: `sha256:${cardId.toLowerCase()}`,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds: [
            ...listAllGeneratedSupportParserCertificationIds(),
            ...conditionalContinuousNonBaseConditionParserCertificationIds,
          ],
          staleCertificationIds: [staleId],
        },
        validateEffectDefinition,
      });

      const blocker = index.entries[0]?.blockers.find((item) =>
        item.message.includes(staleId),
      );
      expect(blocker).toMatchObject({
        code: "unsupported-primitive",
        diagnosticLayer: "review",
      });
      expect(blocker?.message).toContain("Stale parser certification");
      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    {
      cardId: "SUP-002F-UNRELATED-STALE-TRASH",
      staleId: "condition:leaderColorCount:self:gte:2",
      sourceText:
        "If you have 7 or more cards in your trash, this Character gains [Rush].",
    },
    {
      cardId: "SUP-002F-UNRELATED-STALE-LEADER",
      staleId: "condition:fieldCount:don:self:lte:6",
      sourceText:
        "If your Leader is multicolored, this Character cannot be removed from the field by your opponent's effects.",
    },
    {
      cardId: "SUP-002F-UNRELATED-STALE-FIELD",
      staleId: "condition:trashCount:self:gte:7",
      sourceText:
        "If you have 6 or less DON!! cards on your field, this Character cannot be removed from the field by your opponent's effects and gains [Rush].",
    },
  ])(
    "keeps support when an unrelated condition certification is stale ($cardId)",
    ({ cardId, staleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseInput,
            cardId: cardId as CardId,
            sourceText,
            sourceTextHash: `sha256:${cardId.toLowerCase()}`,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds: [
            ...listAllGeneratedSupportParserCertificationIds(),
            ...conditionalContinuousNonBaseConditionParserCertificationIds,
          ],
          staleCertificationIds: [staleId],
        },
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        status: "supported",
      });
    },
  );
});
