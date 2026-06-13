import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash-to-deck-bottom cost into attach-DON then conditional K.O. sequence", () => {
  const result = parseCardEffectLine(
    "[On Play] You may place 3 {Navy} type cards from your trash at the bottom of your deck in any order: Give up to 1 rested DON!! card to 1 of your Leader. Then, if there is a Character with a cost of 9 or more, K.O. up to 1 of your opponent's Characters with a cost of 7 or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 3,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                filter: { typesAny: ["Navy"] },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "selectCards",
                          zone: "costArea",
                          player: "self",
                          max: 1,
                          filter: { categories: ["don"], state: "rested" },
                        },
                      },
                      {
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "self",
                            zones: ["leaderArea", "characterArea"],
                            filter: { categories: ["leader"] },
                          },
                        },
                      },
                      {
                        effect: { type: "attachSelectedDon" },
                      },
                    ],
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "conditional",
                    if: {
                      type: "or",
                      conditions: [
                        {
                          type: "fieldCount",
                          player: "self",
                          op: "gte",
                          value: 1,
                          filter: {
                            categories: ["character"],
                            cost: { min: 9 },
                          },
                        },
                        {
                          type: "fieldCount",
                          player: "opponent",
                          op: "gte",
                          value: 1,
                          filter: {
                            categories: ["character"],
                            cost: { min: 9 },
                          },
                        },
                      ],
                    },
                    then: {
                      type: "sequence",
                      effects: [
                        {
                          effect: {
                            type: "selectTargets",
                            request: {
                              player: "opponent",
                              zone: "characterArea",
                              max: 1,
                              filter: {
                                categories: ["character"],
                                cost: { max: 7 },
                              },
                            },
                          },
                        },
                        {
                          connector: "then",
                          effect: { type: "ko" },
                        },
                      ],
                    },
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
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "instruction:attachDon",
      "expression:conditional",
      "condition:fieldCount",
      "instruction:ko",
    ]),
  );
});

it("parses counted self Leader as a reusable rested-DON attachment target", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 1 rested DON!! card to 1 of your Leader.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "costArea",
              player: "self",
              max: 1,
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: {
                zones: ["leaderArea", "characterArea"],
                player: "self",
                filter: { categories: ["leader"] },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:attachDon",
      "zone:leaderArea",
      "filter:category:leader",
      "composition:selectThenApply",
    ]),
  );
});
