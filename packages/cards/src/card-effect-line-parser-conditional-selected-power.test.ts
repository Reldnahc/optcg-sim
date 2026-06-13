import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses selected counter power with a conditional additional saved-target modifier", () => {
  const result = parseCardEffectLine(
    "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have a {Revolutionary Army} type Character with a cost of 8 or more, that card gains an additional +2000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:power-continuation-target",
            effect: { type: "selectTargets" },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Revolutionary Army"],
                  cost: { min: 8 },
                },
                op: "gte",
                value: 1,
              },
              then: {
                type: "modifyPower",
                value: 2000,
                duration: { type: "thisBattle" },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "composition:selectThenApply",
      "expression:conditional",
      "condition:fieldCount",
      "filter:type",
      "filter:cost",
      "duration:thisBattle",
    ]),
  );
});
