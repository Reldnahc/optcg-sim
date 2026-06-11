import { expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

it("parses delayed deck-out rules text as a reusable rule modifier", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, you do not lose when your deck has 0 cards. You lose at the end of the turn in which your deck becomes 0 cards.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "ruleModifier",
        modifier: {
          type: "deckOutLossTiming",
          timing: "endOfTurn",
        },
      },
      evidence: [
        "ruleModifier:deckOutLossTiming",
        "zone:deck",
        "condition:threshold:nonNegativeInteger",
        "duration:endOfTurn",
      ],
    },
  });
});

it("parses deck-top trash followed by deck-count conditional activation", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Trash 4 cards from the top of your deck. Then, if your deck has 0 cards, set up to 1 of your Characters as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "moveCards",
              count: 4,
              from: { player: "self", zone: "deck", position: "top" },
              to: { player: "self", zone: "trash" },
              order: "original",
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "deckCount",
                player: "self",
                op: "eq",
                value: 0,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        zone: "characterArea",
                        player: "self",
                        filter: { categories: ["character"] },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "activate",
                      target: { type: "savedFieldObject" },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "instruction:moveCards",
      "condition:deckCount",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      "instruction:activate",
      "zone:deck",
      "zone:characterArea",
      "expression:sequence",
      "expression:conditional",
      "composition:selectThenApply",
    ]),
  );
});
