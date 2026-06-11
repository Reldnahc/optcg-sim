import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent optional return-DON failure into reusable cost and connector primitives", () => {
  const result = parseCardEffectLine(
    "[On Your Opponent's Attack] You may rest this Character: Your opponent may return 1 of their active DON!! cards to their DON!! deck. If they do not, give up to 1 of your opponent's Leader or Character cards -2000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onOpponentAttack" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "restSelf",
                optional: true,
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
                    type: "payCost",
                    cost: {
                      type: "returnDon",
                      count: 1,
                      chooser: "opponent",
                      sourceState: "active",
                      optional: true,
                    },
                  },
                },
                {
                  connector: "ifPreviousNotSucceeded",
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
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onOpponentAttack",
      "composition:optionalCostedEffect",
      "cost:restSelf",
      "composition:opponentOptionalCost",
      "cost:returnDon",
      "chooser:opponent",
      "state:active",
      "connector:ifPreviousNotSucceeded",
      "instruction:modifyPower",
      "target:opponentLeaderOrCharacters",
      "duration:thisTurn",
    ]),
  );
});

it("reuses the opponent optional return-DON branch without an outer cost wrapper", () => {
  const result = parseCardEffectLine(
    "[On Your Opponent's Attack] Your opponent may return 2 of their active DON!! cards to their DON!! deck. If they do not, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onOpponentAttack" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: 2,
                chooser: "opponent",
                sourceState: "active",
                optional: true,
              },
            },
          },
          {
            connector: "ifPreviousNotSucceeded",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});
