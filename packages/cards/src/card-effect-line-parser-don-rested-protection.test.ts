import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses all-DON-rested field removal protection as conditional continuous primitives", () => {
  const result = parseCardEffectLine(
    "If all of your DON!! cards are rested, this Character cannot be removed from the field by your opponent's effects.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "giveProtection",
        target: { type: "self" },
        protection: {
          process: "fieldRemoval",
          fieldRemoval: {
            classification: "moveFromFieldToOtherZone",
            sourceKind: "cardEffect",
            sourceControllerRelation: "opponentControlled",
          },
        },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              {
                type: "fieldCount",
                player: "self",
                filter: { categories: ["don"] },
                op: "gte",
                value: 1,
              },
              {
                type: "fieldCount",
                player: "self",
                filter: { categories: ["don"], state: "active" },
                op: "eq",
                value: 0,
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "expression:conditionalContinuous",
      "composition:conditionAnd",
      "condition:donFieldCount",
      "filter:state:active",
      "instruction:giveProtection",
      "protectionProcess:fieldRemoval",
      "protectionSource:opponentEffects",
      "duration:whileConditionTrue",
    ]),
  );
});
