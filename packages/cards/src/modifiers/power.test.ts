import { describe, expect, it } from "vitest";

import {
  parsePositivePowerModifier,
  positivePowerModifierPrimitive,
} from "./power.js";

describe("power modifier parser", () => {
  it("defines positive power as a modifier primitive parent", () => {
    expect(positivePowerModifierPrimitive).toEqual({
      primitiveId: "modifier:positivePower",
      matches: [{ id: "plus-n-power" }],
    });
  });

  it("parses positive power and leaves duration text", () => {
    expect(
      parsePositivePowerModifier({
        text: "+2000 power until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      value: 2000,
      evidence: ["modifier:positivePower"],
      rest: "until the end of your opponent's next End Phase.",
    });
  });
});
