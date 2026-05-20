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

  it("reports recognized conditional keyword-grant components while keeping generated support unsupported", () => {
    const sourceText =
      "If your Leader is multicolored, this Character gains [Double Attack].";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-021B-KEYWORD-GRANT-DIAGNOSTIC" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-021b-keyword-grant-diagnostic",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-021B-KEYWORD-GRANT-DIAGNOSTIC",
    );

    expect(report.supportedCardIds).toEqual([]);
    expect(report.unsupportedCardIds).toEqual([
      "CARD-021B-KEYWORD-GRANT-DIAGNOSTIC",
    ]);
    expect(report.statusByCardId["CARD-021B-KEYWORD-GRANT-DIAGNOSTIC"]).toEqual(
      {
        blockerCodes: ["unparsed-span"],
        componentEvidenceIds: [],
        missingCapabilityIds: [],
        parseStatus: "partial",
        parserRuleIds: [],
        status: "unsupported",
      },
    );
    expect(blocker).toMatchObject({
      code: "unparsed-span",
      layer: "parser",
      span: { text: sourceText },
    });
    expect(blocker?.decomposition).toMatchObject({
      recognizedActionCandidates: ["this Character gains [Double Attack]"],
      recognizedSyntaxFragments: [
        "if-conditional-wrapper",
        "condition-components:v1",
        "keyword-grant-components:v1",
      ],
      unsupportedSyntaxFragments: [
        "conditional-keyword-grant:schema-runtime-bridge-missing",
      ],
    });
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "keyword-grant:target:self-character",
          kind: "target",
          text: "this Character",
        }),
        expect.objectContaining({
          id: "keyword-grant:verb:gains",
          kind: "verb",
          text: "gains",
        }),
        expect.objectContaining({
          id: "keyword-grant:keyword:doubleAttack",
          kind: "keyword",
          text: "[Double Attack]",
        }),
      ]),
    );
  });

  it("reports narrow unsupported keyword-grant components instead of dropping body diagnostics", () => {
    const sourceText =
      "If your Leader is multicolored, this Character gains [Guard].";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-021B-UNSUPPORTED-KEYWORD-GRANT-DIAGNOSTIC" as CardId,
          sourceText,
          sourceTextHash:
            "sha256:card-021b-unsupported-keyword-grant-diagnostic",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) =>
        candidate.cardId === "CARD-021B-UNSUPPORTED-KEYWORD-GRANT-DIAGNOSTIC",
    );

    expect(blocker).toMatchObject({
      code: "unparsed-span",
      layer: "parser",
      span: { text: sourceText },
    });
    expect(blocker?.decomposition).toMatchObject({
      recognizedActionCandidates: ["this Character gains [Guard]"],
      recognizedSyntaxFragments: [
        "if-conditional-wrapper",
        "condition-components:v1",
      ],
      unsupportedSyntaxFragments: ["keyword-grant-fragment:unsupported"],
    });
    expect(blocker?.decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "keyword-grant:unsupported-keyword:21-28",
          kind: "keyword",
          span: { end: 60, start: 53, text: "[Guard]" },
          status: "unsupported",
          text: "[Guard]",
        }),
      ]),
    );
  });

  it("does not classify unrelated bracketed conditional text as a keyword grant", () => {
    const sourceText =
      "If your Leader is multicolored, reveal up to 1 [Zou] type card from your deck.";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-021B-BRACKETED-NON-GRANT-DIAGNOSTIC" as CardId,
          sourceText,
          sourceTextHash: "sha256:card-021b-bracketed-non-grant-diagnostic",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);
    const blocker = report.blockers.find(
      (candidate) =>
        candidate.cardId === "CARD-021B-BRACKETED-NON-GRANT-DIAGNOSTIC",
    );

    expect(blocker?.decomposition?.unsupportedSyntaxFragments).not.toContain(
      "keyword-grant-fragment:unsupported",
    );
    expect(blocker?.decomposition?.recognizedSyntaxFragments).not.toContain(
      "keyword-grant-components:v1",
    );
  });

  it("keeps representative CARD-020C arbitrary-text probe samples decomposed and fail-closed", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseInput,
          cardId: "CARD-020C-SUPERNOVAS" as CardId,
          sourceText:
            "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
          sourceTextHash: "sha256:card-020c-supernovas",
        },
        {
          ...baseInput,
          cardId: "CARD-020C-SLASH-KO" as CardId,
          sourceText:
            "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters -1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
          sourceTextHash: "sha256:card-020c-slash-ko",
        },
        {
          ...baseInput,
          cardId: "CARD-020C-CONDITIONAL-DRAW" as CardId,
          sourceText:
            "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
          sourceTextHash: "sha256:card-020c-conditional-draw",
        },
        {
          ...baseInput,
          cardId: "CARD-020C-BOTTOM-DECK" as CardId,
          sourceText:
            "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
          sourceTextHash: "sha256:card-020c-bottom-deck",
        },
        {
          ...baseInput,
          cardId: "CARD-020C-ACTIVATE-MAIN" as CardId,
          sourceText:
            "[Activate: Main] You may rest this Stage and turn 1 card from the top of your Life cards face-up: Up to 1 of your {Straw Hat Crew} type Characters gains +1000 power until the end of your opponent's next turn.",
          sourceTextHash: "sha256:card-020c-activate-main",
        },
        {
          ...baseInput,
          cardId: "CARD-020C-UNWRAPPED-CONTINUOUS" as CardId,
          sourceText:
            "If your Leader has the {Sky Island} type, this Character gains [Rush].",
          sourceTextHash: "sha256:card-020c-unwrapped-continuous",
        },
      ],
      validateEffectDefinition,
    });
    const report = buildGeneratedSupportReport(index);

    expect(report.supportedCardIds).toContain("CARD-020C-CONDITIONAL-DRAW");
    expect(report.unsupportedCardIds).toEqual(
      expect.arrayContaining([
        "CARD-020C-SUPERNOVAS",
        "CARD-020C-SLASH-KO",
        "CARD-020C-BOTTOM-DECK",
        "CARD-020C-ACTIVATE-MAIN",
        "CARD-020C-UNWRAPPED-CONTINUOUS",
      ]),
    );

    const slashKo = report.blockers.find(
      (candidate) => candidate.cardId === "CARD-020C-SLASH-KO",
    );
    expect(slashKo?.decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "wrapper:slash",
        "sequence:then",
        "modifier:cost-negative",
      ]),
    );
  });
});
