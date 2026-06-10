import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent battle power debuff under counter timing without timing-specific body support", () => {
  const result = parseCardEffectLine(
    "[Counter] Give up to 1 of your opponent's Leader or Character cards -2000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "counter" },
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            filter: { categories: ["leader", "character"] },
          },
        },
        value: -2000,
        duration: { type: "thisBattle" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:modifyPower",
      "target:opponentLeaderOrCharacters",
      "modifier:negativePower",
      "duration:thisBattle",
    ]),
  );
});
