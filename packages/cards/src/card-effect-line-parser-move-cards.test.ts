import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser move-cards costs", () => {
  it("parses optional rest plus move-cards cost into opponent hand-count trash", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may rest this Character and place 2 cards from your trash at the bottom of your deck in any order: If your opponent has 6 or more cards in their hand, your opponent trashes 1 card from their hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restSelf" },
                    {
                      type: "moveCards",
                      count: 2,
                      chooser: "self",
                      from: { player: "self", zone: "trash" },
                      to: {
                        player: "self",
                        zone: "deck",
                        position: "bottom",
                      },
                      order: "chooserChoice",
                    },
                  ],
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "handCount",
                  player: "opponent",
                  op: "gte",
                  value: 6,
                },
                then: {
                  type: "trashFromHand",
                  player: "opponent",
                  chooser: "opponent",
                  count: 1,
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
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCharacter",
        "cost:moveCards",
        "zone:trash",
        "destination:deck",
        "order:anyOrder",
        "condition:handCount",
        "condition:comparator:gte",
        "player:opponent",
        "instruction:trashFromHand",
        "chooser:opponent",
      ]),
    );
  });
});
