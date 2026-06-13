import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses self hand effect-play restrictions as permanent hand primitives", () => {
  const result = parseCardEffectLine(
    "This card in your hand cannot be played by effects.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "preventPlayByEffects",
        target: { type: "self" },
        duration: { type: "permanent" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:preventPlayByEffects",
      "target:thisCard",
      "zone:hand",
      "duration:permanent",
    ]),
  );
});
