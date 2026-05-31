import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("opponent attack effect line parser", () => {
  it("parses opponent-attack once-per-turn rest-DON cost into opponent Leader or Character rest primitives", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards: Rest up to 1 of your opponent's Leader or Character cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onOpponentAttack" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 1,
                  chooser: "self",
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "rest",
                target: {
                  type: "chooseFromZones",
                  request: {
                    chooser: "self",
                    player: "opponent",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["leader", "character"],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onOpponentAttack",
        "marker:oncePerTurn",
        "composition:optionalCostedEffect",
        "cost:restDon",
        "instruction:rest",
        "cardinality:upTo",
        "target:opponentLeaderOrCharacters",
        "filter:category:leader",
        "filter:category:character",
      ]),
    );
  });
});
