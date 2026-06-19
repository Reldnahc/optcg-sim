import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses an ordered body followed by a trailing conditional body", () => {
  const result = parseCardEffectLine(
    "[On Play] If your Leader has the {East Blue} type, rest up to 1 of your opponent's Characters with a cost of 2 or less and, if you don't have [Buchi], play up to 1 [Buchi] from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        player: "self",
        zone: "leaderArea",
        filter: { typesAny: ["East Blue"] },
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
                      player: "opponent",
                      zone: "characterArea",
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 2 },
                      },
                    },
                  },
                },
                { effect: { type: "rest" } },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "self",
                filter: { names: ["Buchi"] },
                op: "eq",
                value: 0,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      filter: { names: ["Buchi"] },
                    },
                  },
                  { effect: { type: "playSelected" } },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "connector:andOrdered",
      "expression:conditional",
      "condition:leaderIdentity",
      "condition:fieldCount",
      "instruction:rest",
      "instruction:playSelected",
      "composition:selectThenPlay",
    ]),
  );
});

it("reuses comma-punctuated conditional continuations with different bodies", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Draw 1 card and, if you have 4 or less cards in your hand, trash 1 card from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "draw" } },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: {
                type: "handCount",
                player: "self",
                op: "lte",
                value: 4,
              },
              then: { type: "trashFromHand" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "connector:andOrdered",
      "instruction:draw",
      "condition:handCount",
      "instruction:trashFromHand",
    ]),
  );
});
