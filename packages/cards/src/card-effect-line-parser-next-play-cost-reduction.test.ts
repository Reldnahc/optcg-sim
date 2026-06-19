import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional next-matching hand play cost reduction with typed Character filters", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If you have 1 or less Characters, the next time you play a {Land of Wano} type Character card with a cost of 3 or more from your hand during this turn, the cost will be reduced by 1.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      condition: {
        type: "fieldCount",
        player: "self",
        op: "lte",
        value: 1,
        filter: { categories: ["character"] },
      },
      effect: {
        type: "modifyCost",
        player: "self",
        sourceZone: "hand",
        filter: {
          categories: ["character"],
          typesAny: ["Land of Wano"],
          cost: { min: 3 },
        },
        value: -1,
        duration: { type: "thisTurn" },
        usageLimit: {
          type: "nextMatchingPlay",
          maxUses: 1,
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "expression:conditional",
      "condition:fieldCount",
      "instruction:modifyCost",
      "filter:type",
      "filter:category:character",
      "usageLimit:nextMatchingPlay",
      "duration:thisTurn",
    ]),
  );
});
