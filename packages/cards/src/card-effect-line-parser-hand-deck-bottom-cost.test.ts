import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses hand-to-deck-bottom and rest-stage as reusable optional cost sequence", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may place 2 cards from your hand at the bottom of your deck in any order and rest this Stage: If your Leader has the {Cross Guild} type, draw 2 cards.",
    ),
  ).toMatchObject({
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
                  {
                    type: "moveCards",
                    count: 2,
                    chooser: "self",
                    from: { player: "self", zone: "hand" },
                    to: { player: "self", zone: "deck", position: "bottom" },
                    order: "chooserChoice",
                  },
                  { type: "restSelf" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "conditional" },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:moveCards",
      "cardinality:exact",
      "count:positiveInteger",
      "player:self",
      "zone:hand",
      "destination:deck",
      "position:bottom",
      "order:anyOrder",
      "cost:restSelf",
      "target:thisCard",
      "expression:conditional",
      "condition:leaderIdentity",
      "player:self",
      "zone:leaderArea",
      "filter:category:leader",
      "filter:type",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});
