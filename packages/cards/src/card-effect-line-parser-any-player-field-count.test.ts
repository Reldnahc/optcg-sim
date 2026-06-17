import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses any-player field count conditions inside optional-costed activate main effects", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: If there are 2 or more Characters with a cost of 8 or more, up to 1 of your {Revolutionary Army} type Leader or Character cards gains +1000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: { type: "payCost", cost: { type: "restSelf" } },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCountTotal",
                players: ["self", "opponent"],
                filter: { categories: ["character"], cost: { min: 8 } },
                op: "gte",
                value: 2,
              },
              then: {
                type: "modifyPower",
                target: {
                  type: "chooseFromZones",
                  request: {
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    filter: {
                      categories: ["leader", "character"],
                      typesAny: ["Revolutionary Army"],
                    },
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
      "entry:activateMain",
      "cost:restSelf",
      "condition:fieldCountTotal",
      "player:self",
      "player:opponent",
      "filter:cost",
      "instruction:modifyPower",
      "target:yourLeaderOrCharacters",
      "composition:optionalCostedEffect",
      "composition:entryExpression",
    ]),
  );
});
