import { describe, expect, it } from "vitest";

import {
  externalDeckConstructionRuleParserRuleId,
  parseExternalDeckConstructionRuleClause,
} from "./external-deck-construction-rule.js";

describe("external deck construction rule", () => {
  it.each([
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 2,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 3 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 3,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Stages with a cost of 1 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Stages",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "stage",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 1,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 0 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 0,
      },
    },
  ])(
    "parses supported non-runtime deck-rule evidence for $sourceText",
    ({ expectedEvidence, sourceText }) => {
      expect(parseExternalDeckConstructionRuleClause(sourceText)).toEqual({
        nonRuntimeEvidence: expectedEvidence,
        parserRuleId: externalDeckConstructionRuleParserRuleId,
      });
    },
  );

  it.each([
    "Under the rules of this game, you cannot include Characters with a cost of 2 or more in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of 2 or less in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of or more in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of 2 or more in your hand.",
    "Under the rules of this game, you cannot include any Events you want in your deck.",
  ])("fails closed for unsupported deck-rule wording: %s", (sourceText) => {
    expect(parseExternalDeckConstructionRuleClause(sourceText)).toBeUndefined();
  });
});
