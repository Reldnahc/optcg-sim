import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses typed Leader base-power setters as a leader condition plus myLeader target", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] Your {Navy} type Leader's base power becomes 7000.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "opponentTurn" },
      effect: {
        type: "setBasePower",
        target: { type: "myLeader" },
        value: 7000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              { type: "opponentTurn" },
              {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Navy"],
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
      "entry:opponentTurn",
      "condition:opponentTurn",
      "condition:leaderIdentity",
      "target:yourLeader",
      "filter:type",
      "instruction:setBasePower",
      "value:basePower:positiveInteger",
      "duration:whileConditionTrue",
      "composition:conditionAnd",
      "composition:entryExpression",
    ]),
  );
});
