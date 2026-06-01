import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses multicolored leader plus self hand-count condition into reusable condition composition", () => {
  expect(
    parseCardEffectLine(
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
    ),
  ).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "and",
        conditions: [
          {
            type: "leaderColorCount",
            player: "self",
            op: "gte",
            value: 2,
          },
          {
            type: "handCount",
            player: "self",
            op: "lte",
            value: 5,
          },
        ],
      },
      effect: { type: "draw", player: "self", count: 2 },
    },
  });
});
