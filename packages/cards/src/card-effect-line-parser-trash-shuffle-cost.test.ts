import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash-to-deck shuffle costs before reusable keyword and power bodies", () => {
  const result = parseCardEffectLine(
    "[When Attacking] [Once Per Turn] You may return 20 cards from your trash to your deck and shuffle it: This Character gains [Double Attack] and +10000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                costs: [
                  {
                    type: "moveCards",
                    count: 20,
                    from: { player: "self", zone: "trash" },
                    to: { player: "self", zone: "deck" },
                  },
                  { type: "shuffleDeck", player: "self" },
                ],
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
                    type: "giveKeyword",
                    target: { type: "self" },
                    keyword: "doubleAttack",
                    duration: { type: "thisBattle" },
                  },
                },
                {
                  effect: {
                    type: "modifyPower",
                    target: { type: "self" },
                    value: 10000,
                    duration: { type: "thisBattle" },
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
      "entry:whenAttacking",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "cost:shuffleDeck",
      "instruction:shuffleDeck",
      "instruction:giveKeyword",
      "keyword:anySupported",
      "instruction:modifyPower",
      "duration:thisBattle",
    ]),
  );
});
