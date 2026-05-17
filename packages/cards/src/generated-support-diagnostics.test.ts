import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

describe("generated support diagnostics", () => {
  it("exposes structured bottom-deck trace fragments without treating or-less as boolean or", () => {
    const sourceText =
      "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-016A-REPORT-BOTTOM-DECK" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-016a-report-bottom-deck",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-016A-REPORT-BOTTOM-DECK",
    );
    expect(blocker).toMatchObject({
      cardId: "CARD-016A-REPORT-BOTTOM-DECK",
      code: "unparsed-span",
    });
    expect(blocker?.decomposition).toMatchObject({
      recognizedActionCandidates: ["place at the bottom of the owner's deck"],
      recognizedTriggerCandidates: ["[On Play]"],
      unsupportedSyntaxFragments: ["action/destination:bottom-of-owner-deck"],
    });
    expect(blocker?.decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "cardinality:up-to",
        "predicate:quantity-comparator",
        "destination:owner-deck-bottom",
      ]),
    );
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        {
          kind: "cardinality",
          status: "recognized",
          text: "up to 1",
        },
        {
          kind: "predicate",
          status: "recognized",
          text: "1000 power or less",
        },
        {
          kind: "destination",
          status: "unsupported",
          text: "bottom of the owner's deck",
        },
      ]),
    );
    expect(blocker?.decomposition?.unsupportedSyntaxFragments).not.toContain(
      "condition conjunction: or",
    );
    expect(report.unsupportedCardIds).toEqual(["CARD-016A-REPORT-BOTTOM-DECK"]);
  });
});
