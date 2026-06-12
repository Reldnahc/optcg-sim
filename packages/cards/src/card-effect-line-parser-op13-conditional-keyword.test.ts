import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses typed other-character presence into a conditional keyword grant", () => {
  const result = parseCardEffectLine(
    "If you have a {Mountain Bandits} type Character other than this card, this Character gains [Double Attack].",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "giveKeyword",
        keyword: "doubleAttack",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "fieldCount",
            player: "self",
            op: "gte",
            value: 1,
            filter: {
              categories: ["character"],
              typesAny: ["Mountain Bandits"],
              excludeSelf: true,
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:fieldCount",
      "filter:type",
      "filter:category:character",
      "filter:excludeSelf",
      "instruction:giveKeyword",
      "keyword:anySupported",
    ]),
  );
});

it("parses total given DON presence into a conditional keyword grant", () => {
  const result = parseCardEffectLine(
    "If you have a total of 2 or more given DON!! cards, this Character gains [Blocker].",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "giveKeyword",
        keyword: "blocker",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "fieldCount",
            player: "self",
            op: "gte",
            value: 2,
            filter: { categories: ["don"], state: "attached" },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:donFieldCount",
      "filter:category:don",
      "filter:state:attached",
      "instruction:giveKeyword",
      "keyword:anySupported",
    ]),
  );
});
