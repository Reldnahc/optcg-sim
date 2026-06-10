import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses self field presence as a reusable condition under Counter timing", () => {
  const result = parseCardEffectLine(
    "[Counter] If you have an {Admiral} type Character, up to 1 of your Leader or Character cards gains +4000 power during this battle.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Admiral"],
        },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "modifyPower",
        value: 4000,
        duration: { type: "thisBattle" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "expression:conditional",
      "condition:fieldCount",
      "condition:comparator:gte",
      "filter:type",
      "filter:category:character",
      "instruction:modifyPower",
      "target:yourLeaderOrCharacters",
      "duration:thisBattle",
    ]),
  );
});
