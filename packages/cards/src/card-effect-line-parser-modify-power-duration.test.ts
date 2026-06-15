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

it("parses typed friendly Character power gain excluding this Character as target filter data", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Activate: Main] [Once Per Turn] Up to 1 of your {Animal} type Characters other than this Character gains +1000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              typesAny: ["Animal"],
              excludeSelf: true,
            },
          },
        },
        value: 1000,
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "entry:activateMain",
      "marker:oncePerTurn",
      "cardinality:upTo",
      "target:yourCharacters",
      "filter:type",
      "filter:category:character",
      "filter:excludeSelf",
      "instruction:modifyPower",
      "modifier:positivePower",
      "duration:thisTurn",
    ]),
  );
});
