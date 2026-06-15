import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP09 protection parser coverage", () => {
  it("parses conditional none-of-your typed K.O. protection as reusable primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] If you have 2 or more rested Characters, none of your {ODYSSEY} or {Straw Hat Crew} type Characters can be K.O.'d by effects until the end of your opponent's next turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        condition: {
          type: "fieldCount",
          player: "self",
          op: "gte",
          value: 2,
          filter: {
            categories: ["character"],
            state: "rested",
          },
        },
        effect: {
          type: "protectFromKO",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: {
              categories: ["character"],
              typesAny: ["ODYSSEY", "Straw Hat Crew"],
            },
          },
          sourceKind: "cardEffect",
          sourceControllerRelation: "eitherController",
          duration: { type: "untilEndOfNextTurn", player: "opponent" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "condition:fieldCount",
        "filter:state:rested",
        "instruction:giveProtection",
        "cardinality:all",
        "filter:type",
        "protectionProcess:ko",
        "protectionSource:effects",
        "duration:opponentNextEndPhase",
      ]),
    );
  });
});
