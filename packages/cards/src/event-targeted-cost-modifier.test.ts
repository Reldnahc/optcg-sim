import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("event targeted cost modifier parser", () => {
  it("parses costed Main draw then selected Character cost gain", () => {
    const result = parseCardEffectLine(
      "[Main] DON!! \u22121: If your Leader is [Enel], draw 1 card. Then, up to 1 of your Characters gains +2 cost until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "conditional",
                      if: {
                        type: "hasCardInZone",
                        player: "self",
                        zone: "leaderArea",
                        filter: { categories: ["leader"], names: ["Enel"] },
                      },
                      then: { type: "draw", player: "self", count: 1 },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyCost",
                      target: { type: "choose" },
                      value: 2,
                      duration: {
                        type: "untilEndOfNextTurn",
                        player: "opponent",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "cost:returnDon",
        "condition:leaderIdentity",
        "instruction:draw",
        "target:yourCharacters",
        "instruction:modifyCost",
        "modifier:positiveCost",
        "duration:opponentNextEndPhase",
      ]),
    );
  });
});
