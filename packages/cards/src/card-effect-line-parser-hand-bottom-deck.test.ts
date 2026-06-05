import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser hand to deck-bottom movement", () => {
  it("parses conditional self hand top-or-bottom deck placement after draw", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader is multicolored, draw 3 cards and place 2 cards from your hand at the top or bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "leaderColorCount",
          player: "self",
          op: "gte",
          value: 2,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 3, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "handSelection:self-hand-to-deck-placement",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 2,
                      max: 2,
                      saveAs: "handSelection:self-hand-to-deck-placement",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "moveSelected",
                      selection: "handSelection:self-hand-to-deck-placement",
                      from: "hand",
                      to: "deck",
                      position: "topOrBottom",
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
        "entry:onPlay",
        "condition:leaderColorCount",
        "instruction:draw",
        "instruction:moveSelected",
        "zone:hand",
        "zone:deck",
        "position:top",
        "position:bottom",
        "composition:selectThenMove",
      ]),
    );
  });

  it("parses On Play hand play followed by opponent hand bottom-deck placement", () => {
    const result = parseCardEffectLine(
      "[On Play] Play up to 1 {Alabasta} type Character card with a cost of 8 or less other than [Nefeltari Vivi] from your hand. Then, your opponent places 1 card from their hand at the bottom of their deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "handSelection:play-from-hand",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Alabasta"],
                        cost: { max: 8 },
                        nameNot: ["Nefeltari Vivi"],
                      },
                    },
                  },
                  {
                    connector: "ifPossible",
                    effect: {
                      type: "playSelected",
                      selection: "handSelection:play-from-hand",
                      ignoreCost: true,
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "handSelection:opponent-hand-to-deck-bottom",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "opponent",
                      chooser: "opponent",
                      min: 1,
                      max: 1,
                      saveAs: "handSelection:opponent-hand-to-deck-bottom",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "moveSelected",
                      selection: "handSelection:opponent-hand-to-deck-bottom",
                      from: "hand",
                      to: "deck",
                      position: "bottom",
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
        "entry:onPlay",
        "instruction:playSelected",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "filter:nameNot",
        "connector:then",
        "instruction:moveSelected",
        "zone:hand",
        "player:opponent",
        "chooser:opponent",
        "zone:deck",
        "position:bottom",
        "composition:selectThenMove",
      ]),
    );
  });
});
