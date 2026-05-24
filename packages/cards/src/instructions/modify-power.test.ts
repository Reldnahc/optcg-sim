import { describe, expect, it } from "vitest";

import {
  modifyPowerInstructionPrimitive,
  parseModifyPowerInstruction,
} from "./modify-power.js";

describe("modify power instruction parser", () => {
  it("defines modifyPower as an instruction parent that composes child primitives", () => {
    expect(modifyPowerInstructionPrimitive).toEqual({
      primitiveId: "instruction:modifyPower",
      childPrimitiveIds: [
        "cardinality:upTo",
        "target:opponentCharacters",
        "modifier:negativePower",
        "duration:thisTurn",
      ],
    });
  });

  it("parses up-to opponent Character negative power for this turn", () => {
    expect(
      parseModifyPowerInstruction({
        text: "give up to 1 of your opponent's Characters −1000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: { categories: ["character"] },
          },
        },
        value: -1000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "modifier:negativePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });
});
