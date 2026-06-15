import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trailing conditionals with threshold-before-stat field presence", () => {
  const result = parseCardEffectLine(
    "[Main] If your Leader has the {Red-Haired Pirates} type, give up to 1 of your opponent's Characters -3000 power during this turn. Then, if your opponent has a Character with 5000 or more power, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesAny: ["Red-Haired Pirates"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              value: -3000,
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "opponent",
                filter: {
                  categories: ["character"],
                  currentPower: { min: 5000 },
                },
                op: "gte",
                value: 1,
              },
              then: { type: "draw", count: 1 },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "expression:sequence",
      "expression:conditional",
      "condition:leaderIdentity",
      "condition:opponentFieldCount",
      "filter:currentPower",
      "instruction:modifyPower",
      "instruction:draw",
    ]),
  );
});
