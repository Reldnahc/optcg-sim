import { expect, it } from "vitest";

import type { Condition } from "@optcg/types";

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

it("applies a shared turn window to each slash-separated entry point", () => {
  const results = parseCardEffectLines(
    "[Your Turn] [On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
  );

  expect(results).toHaveLength(2);
  expect(results.map((result) => result.block.trigger)).toEqual([
    { type: "onPlay" },
    { type: "whenAttacking" },
  ]);
  for (const result of results) {
    expect(flattenAndConditions(result.block.condition)).toEqual(
      expect.arrayContaining([
        { type: "yourTurn" },
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
      ]),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "condition:yourTurn",
        "composition:entryAlternatives",
        "composition:conditionAnd",
      ]),
    );
  }
});

it("treats slash-separated leading turn windows as context for action entries", () => {
  const results = parseCardEffectLines(
    "[Your Turn] / [On Play] Play up to 1 Character with a cost of 1 from your trash.",
  );

  expect(results).toHaveLength(1);
  expect(results[0]?.block).toMatchObject({
    category: "auto",
    trigger: { type: "onPlay" },
    condition: { type: "yourTurn" },
    effect: {
      type: "sequence",
      effects: [
        {
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              cost: { op: "eq", value: 1 },
            },
          },
        },
        {
          connector: "ifPossible",
          effect: { type: "playSelected" },
        },
      ],
    },
  });
  expect(results[0]?.evidence).toEqual(
    expect.arrayContaining([
      "entry:yourTurn",
      "condition:yourTurn",
      "entry:onPlay",
      "composition:entryExpression",
    ]),
  );
});

function flattenAndConditions(
  condition: Condition | undefined,
): readonly Condition[] {
  if (condition === undefined) {
    return [];
  }
  if (condition.type !== "and") {
    return [condition];
  }
  return condition.conditions.flatMap(flattenAndConditions);
}
