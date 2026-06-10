import { describe, expect, it } from "vitest";

import { parseTargetedModifyCostInstruction } from "./modify-cost.js";

describe("modify cost instruction parser", () => {
  it("parses targeted positive cost modifiers over your Characters", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "up to 1 of your Characters gains +2 cost until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      effect: {
        type: "modifyCost",
        player: "self",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["character"] },
          },
        },
        value: 2,
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses targeted positive cost modifiers during this turn", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "up to 1 of your Characters gains +2 cost during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        value: 2,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });
});
