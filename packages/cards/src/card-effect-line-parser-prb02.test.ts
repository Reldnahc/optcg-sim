import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses delayed opponent active-DON rest at the start of their next Main Phase", () => {
  const result = parseCardEffectLine(
    "[Your Turn] [On Play] If your Leader is multicolored and your opponent has 7 or less DON!! cards on their field, your opponent rests 1 of their active DON!! cards at the start of their next Main Phase.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "and",
        conditions: [
          { type: "yourTurn" },
          {
            type: "and",
            conditions: [
              {
                type: "leaderColorCount",
                player: "self",
                op: "gte",
                value: 2,
              },
              {
                type: "fieldCount",
                player: "opponent",
                filter: { categories: ["don"] },
                op: "lte",
                value: 7,
              },
            ],
          },
        ],
      },
      effect: {
        type: "delayed",
        timing: {
          type: "startOfMainPhase",
          turn: "next",
          player: "opponent",
        },
        effect: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              chooser: "opponent",
              player: "opponent",
              zones: ["costArea"],
              min: 1,
              max: 1,
              filter: { categories: ["don"], state: "active" },
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "entry:yourTurn",
      "condition:leaderColorCount",
      "condition:donFieldCount",
      "composition:delayed",
      "duration:startOfNextMainPhase",
      "instruction:rest",
      "filter:category:don",
      "filter:state:active",
    ]),
  );
});

it("parses rest replacement into a typed reusable replacement trigger", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] If this Character would be rested by your opponent's Character's effect, you may rest 1 of your other Characters instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      condition: { type: "opponentTurn" },
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldBeRested",
          sourceKind: "cardEffect",
          sourceControllerRelation: "opponentControlled",
          sourceCardFilter: { categories: ["character"] },
          target: { type: "self" },
        },
      },
      effect: {
        type: "replacement",
        when: {
          type: "wouldBeRested",
          sourceKind: "cardEffect",
          sourceControllerRelation: "opponentControlled",
          sourceCardFilter: { categories: ["character"] },
          target: { type: "self" },
        },
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              chooser: "self",
              player: "self",
              zones: ["characterArea"],
              min: 1,
              max: 1,
              filter: {
                categories: ["character"],
                excludeSelf: true,
              },
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:replacement",
      "entry:opponentTurn",
      "replacement:wouldBeRested",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "filter:category:character",
      "filter:excludeSelf",
      "composition:replacementInstead",
    ]),
  );
});
