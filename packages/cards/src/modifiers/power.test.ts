import { describe, expect, it } from "vitest";

import { allPowerModifierParsers, parseModifierFromSet } from "./index.js";
import {
  negativePowerModifierPrimitive,
  parseNegativePowerModifier,
  parsePositivePowerModifier,
  positivePowerModifierPrimitive,
} from "./power.js";

describe("power modifier parser", () => {
  it("defines positive power as a modifier primitive parent", () => {
    expect(positivePowerModifierPrimitive).toEqual({
      primitiveId: "modifier:positivePower",
      matches: [{ id: "plus-n-power" }],
    });
    expect(negativePowerModifierPrimitive).toEqual({
      primitiveId: "modifier:negativePower",
      matches: [{ id: "minus-n-power" }],
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

  it.each(["−1000 power during this turn.", "-1000 power during this turn."])(
    "parses negative power and leaves duration text: %s",
    (text) => {
      expect(parseNegativePowerModifier({ text })).toEqual({
        value: -1000,
        evidence: ["modifier:negativePower"],
        rest: "during this turn.",
      });
    },
  );

  it("parses en-dash negative power modifiers", () => {
    expect(
      parseNegativePowerModifier({
        text: "–1000 power during this turn.",
      }),
    ).toEqual({
      value: -1000,
      evidence: ["modifier:negativePower"],
      rest: "during this turn.",
    });
  });

  it("parses signed power modifiers through a semantic modifier group", () => {
    expect(
      parseModifierFromSet(
        { text: "-3000 power during this turn." },
        allPowerModifierParsers,
      ),
    ).toEqual({
      value: -3000,
      evidence: ["modifier:negativePower"],
      rest: "during this turn.",
    });
  });
});
