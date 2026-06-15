import { describe, expect, it } from "vitest";

import { parseDrawInstruction } from "../instructions/index.js";
import { costedEffectExpressionParser } from "./costed-effect.js";

describe("costed effect expression parser", () => {
  it("parses return-DON cost as an engine-supported payCost sequence segment", () => {
    expect(
      costedEffectExpressionParser({
        instructions: [parseDrawInstruction],
      })({ text: "DON!! −1: Draw 1 card." }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:returnDon",
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
            },
          },
          {
            id: "body:after-cost",
            connector: "ifYouDo",
            effect: { type: "draw", count: 1, player: "self" },
          },
        ],
      },
      evidence: [
        "composition:costedEffect",
        "cost:returnDon",
        "count:positiveInteger",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
      ],
      rest: "",
    });
  });
});
