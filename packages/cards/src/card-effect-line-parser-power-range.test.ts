import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses DON return cost into conditional draw plus power-range hand play", () => {
  const result = parseCardEffectLine(
    "[On Play] DON!! \u22122: If your Leader has the {Big Mom Pirates} type and your opponent has 6 or more DON!! cards on their field, draw 2 cards. Then, play up to 1 {Big Mom Pirates} type Character card with 6000 to 8000 power from your hand.",
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
              type: "payCost",
              cost: { type: "returnDon", count: 2, optional: true },
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
                    type: "conditional",
                    if: {
                      type: "and",
                      conditions: [
                        {
                          type: "hasCardInZone",
                          player: "self",
                          zone: "leaderArea",
                          filter: {
                            categories: ["leader"],
                            typesAny: ["Big Mom Pirates"],
                          },
                        },
                        {
                          type: "fieldCount",
                          player: "opponent",
                          filter: { categories: ["don"] },
                          op: "gte",
                          value: 6,
                        },
                      ],
                    },
                    then: { type: "draw", player: "self", count: 2 },
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
                          type: "selectCards",
                          zone: "hand",
                          player: "self",
                          chooser: "self",
                          min: 0,
                          max: 1,
                          filter: {
                            categories: ["character"],
                            typesAny: ["Big Mom Pirates"],
                            power: { min: 6000, max: 8000 },
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
      "sourcePresence:mustRemain",
      "composition:costedEffect",
      "cost:returnDon",
      "count:positiveInteger",
      "expression:sequence",
      "expression:conditional",
      "composition:conditionAnd",
      "condition:leaderIdentity",
      "condition:donFieldCount",
      "instruction:draw",
      "connector:then",
      "instruction:playSelected",
      "filter:power",
      "composition:selectThenPlay",
      "composition:entryExpression",
    ]),
  );
});
