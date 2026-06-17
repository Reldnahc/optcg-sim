import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect parser composition decoupling", () => {
  it("saves optional paid-cost references from the cost primitive, not the body", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] You may rest any number of your DON!! cards: Draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onOpponentAttack" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "paidCost:restDon",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 0,
                  maxCount: "available",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
    });
  });

  it("parses select-then-apply continuations without requiring a power first effect", () => {
    const result = parseCardEffectLine(
      "[Main] Select up to 1 of your opponent's Characters. Then, that card gains [Blocker] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "selected:power-continuation-target",
              effect: {
                type: "selectTargets",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "giveKeyword",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:power-continuation-target",
                  },
                },
                keyword: "blocker",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:selectThenApply",
        "instruction:selectTargets",
        "instruction:giveKeyword",
        "target:selectedCharacter",
      ]),
    );
  });
});
