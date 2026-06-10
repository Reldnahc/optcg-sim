import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser attack declaration costs", () => {
  it("parses selected opponent Characters attack trash cost as reusable primitives", () => {
    const result = parseCardEffectLine(
      `[On Play] If your Leader's type includes "Whitebeard Pirates" and you have 2 or less Life cards, select all of your opponent's Characters on their field. Until the end of your opponent's next turn, none of the selected Characters can attack unless your opponent trashes 2 cards from their hand whenever they attack.`,
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        condition: {
          type: "and",
          conditions: [
            {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "self",
              filter: {
                categories: ["leader"],
                typesIncludeAny: ["Whitebeard Pirates"],
              },
            },
            {
              type: "lifeCount",
              player: "self",
              op: "lte",
              value: 2,
            },
          ],
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "selected:attack-cost-targets",
              effect: {
                type: "selectAllTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  filter: { categories: ["character"] },
                  visibility: "public",
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "attackCost",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:attack-cost-targets",
                  },
                  player: "opponent",
                  zone: "characterArea",
                },
                cost: {
                  type: "trashFromHand",
                  count: 2,
                },
                duration: {
                  type: "untilEndOfNextTurn",
                  player: "opponent",
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "composition:conditionAnd",
        "condition:lifeCount",
        "instruction:selectAllTargets",
        "target:opponentCharacters",
        "instruction:attackCost",
        "cost:trashFromHand",
        "duration:opponentNextEndPhase",
        "composition:selectThenApply",
      ]),
    );
  });
});
