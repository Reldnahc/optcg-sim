import { expect, it } from "vitest";

import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";

it("parses DON deck-size rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, your DON!! deck consists of 6 cards.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "donDeckSize",
          count: 6,
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:donDeckSize",
        "filter:category:don",
        "zone:donDeck",
        "count:positiveInteger",
      ],
    },
  });
});

it("parses any-copy deck rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, you may have any number of this card in your deck.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "anyCopiesOfThisCard",
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:anyCopiesOfThisCard",
        "target:thisCard",
        "zone:deck",
      ],
    },
  });
});

it("parses maximum deck card cost rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, you cannot include cards with a cost of 5 or more in your deck.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "cardCostLessThan",
          cost: 5,
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:cardCostLessThan",
        "filter:any",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "zone:deck",
      ],
    },
  });
});

it("parses deck-out win rules text as rule metadata", () => {
  const result = parseCardEffectLineDetailed(
    "When your deck is reduced to 0, you win the game instead of losing, according to the rules.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "ruleModifier",
        modifier: {
          type: "deckOutWin",
        },
      },
      evidence: [
        "ruleModifier:deckOutWin",
        "condition:deckCount",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "instruction:winGame",
        "player:self",
        "zone:deck",
      ],
    },
  });
});

it("parses compound deck restriction plus deck-out win rules text without dropping either primitive", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, you can only include {East Blue} type cards in your deck and when your deck is reduced to 0, you win the game instead of losing.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "compound",
        entries: [
          {
            type: "deckRestriction",
            restriction: {
              type: "typeIncludesOnly",
              typeText: "East Blue",
            },
          },
          {
            type: "ruleModifier",
            modifier: {
              type: "deckOutWin",
            },
          },
        ],
      },
      evidence: [
        "deckRestriction:typeIncludesOnly",
        "filter:typeIncludes",
        "zone:deck",
        "ruleModifier:deckOutWin",
        "condition:deckCount",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "instruction:winGame",
        "player:self",
        "zone:deck",
      ],
    },
  });
});
