import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceTextHash: "sha256:source",
};

const validateEffectDefinition = (definition: EffectDefinition) => {
  void definition;
  return { valid: true } as const;
};

describe("standalone keyword parser certification", () => {
  it.each([
    {
      cardId: "CARD-013B-MISSING-CERT-BLOCKER" as CardId,
      expectedCertificationId: "keyword:blocker:printed",
      printedKeywords: ["blocker"] as const,
      sourceText: "[Blocker]",
    },
    {
      cardId: "CARD-013B-MISSING-CERT-RUSH" as CardId,
      expectedCertificationId: "keyword:rush:printed",
      printedKeywords: ["rush"] as const,
      sourceText: "[Rush]",
    },
    {
      cardId: "CARD-013B-MISSING-CERT-RUSH-CHARACTER" as CardId,
      expectedCertificationId: "keyword:rush-character:printed",
      printedKeywords: ["rushCharacter"] as const,
      sourceText: "[Rush: Character]",
    },
    {
      cardId: "CARD-013B-MISSING-CERT-DOUBLE-ATTACK" as CardId,
      expectedCertificationId: "keyword:double-attack:printed",
      printedKeywords: ["doubleAttack"] as const,
      sourceText: "[Double Attack]",
    },
    {
      cardId: "CARD-013B-MISSING-CERT-BANISH" as CardId,
      expectedCertificationId: "keyword:banish:printed",
      printedKeywords: ["banish"] as const,
      sourceText: "[Banish]",
    },
  ])(
    "fails closed when parser certification evidence is omitted ($expectedCertificationId)",
    ({ cardId, expectedCertificationId, printedKeywords, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            cardId,
            category: "character",
            printedKeywords,
            sourceText,
          },
        ],
        validateEffectDefinition,
      });

      const blocker = index.entries[0]?.blockers.find((item) =>
        item.message.includes(expectedCertificationId),
      );
      expect(blocker).toMatchObject({
        code: "unsupported-primitive",
        diagnosticLayer: "review",
      });
      expect(blocker?.message).toContain("Missing parser certification");
      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    {
      cardId: "CARD-013B-STALE-CERT-BLOCKER" as CardId,
      staleId: "keyword:blocker:printed",
      printedKeywords: ["blocker"] as const,
      sourceText: "[Blocker]",
    },
    {
      cardId: "CARD-013B-STALE-CERT-RUSH" as CardId,
      staleId: "keyword:rush:printed",
      printedKeywords: ["rush"] as const,
      sourceText: "[Rush]",
    },
    {
      cardId: "CARD-013B-STALE-CERT-RUSH-CHARACTER" as CardId,
      staleId: "keyword:rush-character:printed",
      printedKeywords: ["rushCharacter"] as const,
      sourceText: "[Rush: Character]",
    },
    {
      cardId: "CARD-013B-STALE-CERT-DOUBLE-ATTACK" as CardId,
      staleId: "keyword:double-attack:printed",
      printedKeywords: ["doubleAttack"] as const,
      sourceText: "[Double Attack]",
    },
    {
      cardId: "CARD-013B-STALE-CERT-BANISH" as CardId,
      staleId: "keyword:banish:printed",
      printedKeywords: ["banish"] as const,
      sourceText: "[Banish]",
    },
  ])(
    "fails closed when parser certification evidence is stale ($staleId)",
    ({ cardId, staleId, printedKeywords, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            cardId,
            category: "character",
            printedKeywords,
            sourceText,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds:
            listAllGeneratedSupportParserCertificationIds(),
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
});
