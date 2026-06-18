import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout parser text normalization", () => {
  it("parses curly apostrophe opponent-turn entry points through the existing turn-window primitive", () => {
    const result = parseCardEffectLine(
      "[On Opponent’s Turn] This Character gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
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
        "instruction:modifyPower",
      ]),
    );
  });

  it("parses fullwidth minus power modifiers through the reusable negative power primitive", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] Give up to 2 of your opponent's Characters －2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        effect: {
          type: "modifyPower",
          value: -2000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "instruction:modifyPower",
        "modifier:negativePower",
      ]),
    );
  });

  it("parses curly apostrophe plural opponent Leader or Character negative power targets", () => {
    const result = parseCardEffectLine(
      "[On Play] Up to 1 of your opponent’s Leaders or Characters gain -1000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "modifyPower",
          value: -1000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "target:opponentLeaderOrCharacters",
        "instruction:modifyPower",
        "modifier:negativePower",
      ]),
    );
  });

  it("parses plural own Leader or Character DON attachment targets", () => {
    const result = parseCardEffectLine(
      "[On Play] Give up to 1 rested DON!! cards to 1 of your Leaders or Characters.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "selectCards", zone: "costArea" } },
            { effect: { type: "selectTargets" } },
            { effect: { type: "attachSelectedDon" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:attachDon",
        "zone:leaderArea",
        "zone:characterArea",
        "filter:category:leader",
        "filter:category:character",
      ]),
    );
  });
});
