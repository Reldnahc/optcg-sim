import { expect, it } from "vitest";

import { parseCardEffectLines } from "./card-effect-line-parser.js";

it("parses slash-separated supported entries into separate reusable effect blocks", () => {
  const results = parseCardEffectLines(
    "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
  );

  expect(results).toHaveLength(2);
  expect(results.map((result) => result.block.trigger)).toEqual([
    { type: "onPlay" },
    { type: "whenAttacking" },
  ]);
  for (const result of results) {
    expect(result).toMatchObject({
      block: {
        category: "auto",
        sourcePresencePolicy: "mustRemainInSameZone",
        condition: {
          type: "and",
          conditions: [
            {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "self",
              filter: {
                categories: ["leader"],
                typesAny: ["Supernovas"],
              },
            },
            {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                names: ["Cavendish"],
                excludeSelf: true,
              },
              op: "eq",
              value: 0,
            },
          ],
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "selectTargets",
                request: {
                  zone: "costArea",
                  player: "self",
                  chooser: "self",
                  min: 0,
                  max: 2,
                  filter: { categories: ["don"], state: "rested" },
                },
              },
            },
            {
              connector: "then",
              effect: { type: "activate" },
            },
          ],
        },
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "composition:entryAlternatives",
        "condition:leaderIdentity",
        "filter:type",
        "condition:fieldCount",
        "filter:name",
        "filter:excludeSelf",
        "composition:conditionAnd",
        "instruction:activate",
        "composition:selectThenApply",
      ]),
    );
  }
});
