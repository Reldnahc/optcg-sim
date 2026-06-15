import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses leader current-power and type conditions into reusable filter predicates", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] If your Leader has 7000 power or more and the {Kid Pirates} type, this Character gains [Rush].",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "permanent" },
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      category: "permanent",
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: "rush",
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              {
                type: "attachedDonCount",
                target: { type: "self" },
                op: "gte",
                value: 1,
              },
              {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  currentPower: { min: 7000 },
                  typesAny: ["Kid Pirates"],
                },
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:leaderIdentity",
      "filter:currentPower",
      "filter:type",
      "instruction:giveKeyword",
      "keyword:anySupported",
      "duration:whileConditionTrue",
    ]),
  );
});
