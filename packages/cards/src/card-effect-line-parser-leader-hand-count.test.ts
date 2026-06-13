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

it("parses leader-name or multicolored condition into reusable condition composition", () => {
  const result = parseCardEffectLine(
    "[On K.O.] If your Leader is [Boa Hancock] or multicolored, draw 2 cards.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onKO" },
      condition: {
        type: "or",
        conditions: [
          {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: { categories: ["leader"], names: ["Boa Hancock"] },
          },
          {
            type: "leaderColorCount",
            player: "self",
            op: "gte",
            value: 2,
          },
        ],
      },
      effect: { type: "draw", player: "self", count: 2 },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onKO",
      "composition:conditionOr",
      "condition:leaderIdentity",
      "condition:leaderColorCount",
      "filter:name",
      "instruction:draw",
    ]),
  );
});
