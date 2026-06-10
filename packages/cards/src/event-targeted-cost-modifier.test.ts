import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("event targeted cost modifier parser", () => {
  it("parses opponent cost reduction then K.O. as independent then segments", () => {
    const result = parseCardEffectLine(
      "[On Play] Give up to 1 of your opponent's Characters -1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "choose" },
                value: -1,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "selected:ko-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          cost: { op: "eq", value: 0 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "ko",
                      target: { type: "savedFieldObject" },
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
        "entry:onPlay",
        "instruction:modifyCost",
        "target:opponentCharacters",
        "modifier:costReduction",
        "duration:thisTurn",
        "connector:then",
        "instruction:ko",
        "composition:selectThenApply",
      ]),
    );
  });

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

  it("parses turn-windowed all own Character cost gain as reusable modifyCost", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] All of your Characters gain +1 cost.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        condition: { type: "opponentTurn" },
        effect: {
          type: "modifyCost",
          player: "self",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: { categories: ["character"] },
          },
          value: 1,
          duration: {
            type: "whileConditionTrue",
            condition: { type: "opponentTurn" },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:modifyCost",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "modifier:positiveCost",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
