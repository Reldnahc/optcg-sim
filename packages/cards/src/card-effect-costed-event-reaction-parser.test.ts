import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("costed event reaction parser", () => {
  it("parses optional stage-rest cost before a field-removal reaction", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] You may rest this Stage: When your {Straw Hat Crew} type Character is removed from the field by your opponent's effect, add up to 1 DON!! card from your DON!! deck and rest it.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "fieldRemoved",
          player: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Straw Hat Crew"],
          },
          sourceController: "opponent",
          sourceKind: "effect",
        },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "restSelf", optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "donDeck", position: "top" },
                to: { player: "self", zone: "costArea" },
                order: "original",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "composition:optionalCostedEffect",
        "cost:restSelf",
        "target:thisCard",
        "trigger:fieldRemoved",
        "filter:type",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "instruction:moveCards",
        "state:rested",
      ]),
    );
  });
});
