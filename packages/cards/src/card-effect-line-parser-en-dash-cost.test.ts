import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional cost sequences into conditional draw and en-dash cost reduction", () => {
  const parsed = parseCardEffectLine(
    "[Activate: Main] You may trash 1 card from your hand and trash this Character: If your Leader has the {Blackbeard Pirates} type, draw 1 card. Then, give up to 1 of your opponent's Characters –2 cost during this turn.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
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
                type: "sequence",
                optional: true,
                costs: [
                  { type: "trashFromHand", count: 1, chooser: "self" },
                  { type: "trashSelf" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "sequence" },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:trashFromHand",
      "cost:trashSelf",
      "expression:sequence",
      "expression:conditional",
      "condition:leaderIdentity",
      "instruction:draw",
      "connector:then",
      "instruction:modifyCost",
      "modifier:costReduction",
      "duration:thisTurn",
      "composition:entryExpression",
    ]),
  );
});
