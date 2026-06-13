import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("rest protection card effect parser", () => {
  it("parses conditional opponent-effects rest protection through reusable condition and protection primitives", () => {
    const result = parseCardEffectLine(
      "If your Leader has the <Slash> attribute and you have 6 or more rested DON!! cards, this Character cannot be rested by your opponent's effects.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "giveProtection",
          target: { type: "self" },
          protection: {
            process: "rest",
            sourceKind: "cardEffect",
            sourceControllerRelation: "opponentControlled",
          },
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    attributesAny: ["slash"],
                  },
                },
                {
                  type: "fieldCount",
                  player: "self",
                  filter: { categories: ["don"], state: "rested" },
                  op: "gte",
                  value: 6,
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
        "condition:leaderIdentity",
        "filter:attribute",
        "condition:donFieldCount",
        "filter:state:rested",
        "instruction:giveProtection",
        "protectionProcess:rest",
        "protectionSource:opponentEffects",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
