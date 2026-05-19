import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { buildGeneratedSupportReport } from "./generated-support-report.js";

const baseInput = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
};

const validateEffectDefinition = () => ({ valid: true }) as const;

const parseCertified = (sourceText: string) =>
  parseCertifiedCardText({
    cardId: "CARD-016A-DIAGNOSTICS" as CardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

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

  it("records residue for supported trash-then-draw clauses followed by unsupported text", () => {
    const text =
      "[On Play] Trash 2 cards from your hand. Draw 1 card. Then draw 1 card.";
    const result = parseCertified(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          span: {
            end: text.length,
            start: 53,
            text: "Then draw 1 card.",
          },
        },
      ],
      parsedRuleIds: ["exact:on-play:trash-2-from-hand:draw-1:self"],
      unparsedSpans: [
        {
          end: text.length,
          start: 53,
          text: "Then draw 1 card.",
        },
      ],
    });
  });

  it("propagates parser scanner decomposition metadata into structured report blockers", () => {
    const sourceText =
      "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020B-REPORT-DIAGNOSTIC" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-020b-report-diagnostic",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020B-REPORT-DIAGNOSTIC",
    );

    expect(blocker).toMatchObject({
      cardId: "CARD-020B-REPORT-DIAGNOSTIC",
      code: "unparsed-span",
      layer: "parser",
    });
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "trigger",
          status: "recognized",
          text: "[On Play]",
        }),
        expect.objectContaining({
          kind: "destination",
          status: "unsupported",
          text: "bottom of the owner's deck",
        }),
      ]),
    );
  });

  it("keeps invalid schema as schema-layer blocker and does not allow parser decomposition to override it", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020B-SCHEMA-NO-OVERRIDE" as CardId,
          sourceText: "[On Play] Draw 1 card.",
          sourceTextHash: "sha256:card-020b-schema-no-override",
        },
      ],
      validateEffectDefinition: () => ({
        errors: ["/effects/0/type failed schema validation"],
        valid: false,
      }),
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020B-SCHEMA-NO-OVERRIDE",
    );

    expect(blocker).toMatchObject({
      cardId: "CARD-020B-SCHEMA-NO-OVERRIDE",
      code: "invalid-dsl-schema",
      component: "/effects/0/type failed schema validation",
      deepestSuccessfulLayer: "parser",
      layer: "schema",
    });
    expect(blocker?.decomposition).toBeUndefined();
  });
});
