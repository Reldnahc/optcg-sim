import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional activation of selected typed Characters plus your Leader", () => {
  const result = parseCardEffectLine(
    "[On Play] If your Leader has the {Minks} type, set up to 2 of your {Minks} type Characters and your Leader as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesAny: ["Minks"] },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      zone: "characterArea",
                      player: "self",
                      min: 0,
                      max: 2,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Minks"],
                      },
                    },
                  },
                },
                { connector: "then", effect: { type: "activate" } },
              ],
            },
          },
          {
            connector: "then",
            effect: { type: "activate", target: { type: "myLeader" } },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:leaderIdentity",
      "instruction:activate",
      "cardinality:upTo",
      "count:positiveInteger",
      "filter:type",
      "target:yourLeader",
      "composition:compoundActivation",
      "composition:selectThenApply",
      "composition:entryExpression",
    ]),
  );
});
