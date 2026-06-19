import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout event-hook parser variants", () => {
  it("parses trailing event activation hooks through the shared reaction predicate", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Your Turn] [Once Per Turn] Draw 1 card when your opponent activates an Event.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "and" },
        oncePerTurn: true,
        trigger: {
          type: "opponentActivated",
          activations: ["event"],
        },
        effect: {
          type: "draw",
          player: "self",
          count: 1,
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "trigger:opponentActivated",
        "activation:event",
        "instruction:draw",
      ]),
    );
  });
});
