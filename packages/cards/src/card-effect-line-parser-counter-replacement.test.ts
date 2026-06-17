import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Counter battle K.O. replacement as a temporary replacement grant", () => {
  expect(
    parseCardEffectLine(
      "[Counter] If any of your Characters would be K.O.'d in battle during this turn, you may trash 1 card from your hand instead.",
    ),
  ).toMatchObject({
    block: {
      trigger: { type: "counter" },
      effect: {
        type: "grantReplacement",
        duration: { type: "thisTurn" },
        replacement: {
          type: "replacement",
          when: {
            type: "wouldBeKOd",
            sourceKind: "battle",
            target: {
              type: "all",
              zone: "characterArea",
              player: "self",
              filter: { categories: ["character"] },
            },
          },
          instead: {
            type: "trashFromHand",
            player: "self",
            chooser: "self",
            count: 1,
          },
        },
      },
    },
  });
});
