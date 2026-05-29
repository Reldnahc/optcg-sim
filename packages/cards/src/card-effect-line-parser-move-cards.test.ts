import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser move-cards costs", () => {
  it("parses Life and deck movement as reusable moveCards primitives", () => {
    const result = parseCardEffectLine(
      "[Main] If your Leader has the {Straw Hat Crew} type, trash 1 card from the top of your Life cards. Then, add up to 1 card from the top of your deck to the top of your Life cards and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            typesAny: ["Straw Hat Crew"],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "trash" },
                order: "original",
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "moveCards",
                      min: 0,
                      count: 1,
                      from: { player: "self", zone: "deck", position: "top" },
                      to: { player: "self", zone: "life", position: "top" },
                      order: "original",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "trashFromHand",
                      count: 1,
                      player: "self",
                      chooser: "self",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "filter:type",
        "instruction:moveCards",
        "zone:life",
        "zone:deck",
        "destination:life",
        "destination:trash",
        "composition:entryExpression",
      ]),
    );
  });

  it("parses optional top-or-bottom Life to hand as a moveCards cost", () => {
    const result = parseCardEffectLine(
      "[On Play] You may add 1 card from the top or bottom of your Life cards to your hand: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "moveCards",
                  count: 1,
                  chooser: "self",
                  from: {
                    player: "self",
                    zone: "life",
                    position: "topOrBottom",
                  },
                  to: { player: "self", zone: "hand" },
                  order: "chooserChoice",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "selectTargets",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "ko",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:moveCards",
        "zone:life",
        "position:top",
        "position:bottom",
        "destination:hand",
        "instruction:ko",
      ]),
    );
  });

  it("parses optional turn-Life-face-up as its own reusable cost primitive", () => {
    const result = parseCardEffectLine(
      "[On Play] You may turn 1 card from the top of your Life cards face-up: Draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "turnLifeFaceUp",
                  count: 1,
                  player: "self",
                  position: "top",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "draw",
                player: "self",
                count: 1,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:turnLifeFaceUp",
        "zone:life",
        "position:top",
        "reveal:bothPlayers",
        "instruction:draw",
      ]),
    );
  });

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
