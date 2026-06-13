import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses counter power followed by an optional DON rest cost and all opponent field power reduction", () => {
  const result = parseCardEffectLine(
    "[Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle. Then, you may rest 1 of your DON!! cards. If you do, give your opponent's Leader and all of their Characters -1000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "payCost",
                    cost: { type: "restDon", count: 1 },
                  },
                },
                {
                  connector: "ifYouDo",
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "modifyPower",
                          target: { type: "all", zone: "leaderArea" },
                          value: -1000,
                        },
                      },
                      {
                        effect: {
                          type: "modifyPower",
                          target: { type: "all", zone: "characterArea" },
                          value: -1000,
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
      "instruction:modifyPower",
      "composition:optionalCostedEffect",
      "cost:restDon",
      "target:opponentLeaderOrCharacters",
      "cardinality:all",
      "zone:leaderArea",
      "zone:characterArea",
      "modifier:negativePower",
      "duration:thisTurn",
    ]),
  );
});
