import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional optional actions inside activate-main sequences", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters -1000 power during this turn. Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "modifyPower" },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "lifeCount",
                player: "self",
                op: "gte",
                value: 2,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    optional: true,
                    effect: {
                      type: "moveCards",
                      count: 1,
                      from: {
                        player: "self",
                        zone: "life",
                        position: "top",
                      },
                      to: { player: "self", zone: "hand" },
                    },
                  },
                ],
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
      "marker:oncePerTurn",
      "instruction:modifyPower",
      "expression:conditional",
      "condition:lifeCount",
      "composition:optionalActionEffect",
      "instruction:moveCards",
      "zone:life",
      "destination:hand",
      "composition:entryExpression",
    ]),
  );
});
