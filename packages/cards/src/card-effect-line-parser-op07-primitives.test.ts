import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses counter return-DON cost with split opponent Leader and Character power reduction", () => {
  const result = parseCardEffectLine(
    "[Counter] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Give up to 1 each of your opponent's Leader and Character cards −2000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
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
                    type: "sequence",
                    effects: [
                      {
                        saveResultAs: "selected:modify-power-leader-target",
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "opponent",
                            zones: ["leaderArea"],
                            min: 0,
                            max: 1,
                            filter: { categories: ["leader"] },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "modifyPower",
                          value: -2000,
                          duration: { type: "thisTurn" },
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
                        saveResultAs: "selected:modify-power-character-target",
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "opponent",
                            zones: ["characterArea"],
                            min: 0,
                            max: 1,
                            filter: { categories: ["character"] },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "modifyPower",
                          value: -2000,
                          duration: { type: "thisTurn" },
                        },
                      },
                    ],
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
      "entry:eventCounter",
      "cost:returnDon",
      "instruction:modifyPower",
      "composition:costedEffect",
      "composition:selectThenApply",
      "target:opponentLeader",
      "target:opponentCharacters",
      "duration:thisTurn",
    ]),
  );
});
